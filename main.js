import { initializeApp } from 'firebase/app';
import { getFirestore, collection, setDoc, addDoc, doc, onSnapshot, getDoc, getDocs, updateDoc, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAJk7c-sEBJjNoHHDc1SZDYNjf_joM4ph8',
  authDomain: 'webrtc-app-22.firebaseapp.com',
  projectId: 'webrtc-app-22',
  storageBucket: 'webrtc-app-22.appspot.com',
  messagingSenderId: '1067771785566',
  appId: '1:1067771785566:web:3feba0ea642df2caa39fcf',
  measurementId: 'G-L619BTVXJC',
};

//Firestore database
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: 'stun:a.relay.metered.ca:80',
    },
    {
      urls: 'turn:a.relay.metered.ca:80',
      username: 'defc44a91ef91d09ad74dbd1',
      credential: '9gzvjeblSmBTiauk',
    },
    {
      urls: 'turn:a.relay.metered.ca:80?transport=tcp',
      username: 'defc44a91ef91d09ad74dbd1',
      credential: '9gzvjeblSmBTiauk',
    },
    {
      urls: 'turn:a.relay.metered.ca:443',
      username: 'defc44a91ef91d09ad74dbd1',
      credential: '9gzvjeblSmBTiauk',
    },
    {
      urls: 'turn:a.relay.metered.ca:443?transport=tcp',
      username: 'defc44a91ef91d09ad74dbd1',
      credential: '9gzvjeblSmBTiauk',
    },
  ],
  iceCandidatePoolSize: 9,
};

let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const lastestIDs = document.getElementById('founded');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const getLastestButton = document.getElementById('lastest');

getLastestButton.onclick = async () => {
  console.log(Date.now());
  const data = await getDocs(collection(db, 'RTCcalls'));
  const calls = data.docs.filter((doc) => doc._document.createTime.timestamp.seconds * 1000 > Date.now() - 60000);
  const callIds = calls.map((call) => call.id);
  lastestIDs.value = callIds.join('\n');
  console.log(calls);
};

//get access to the user's camera and microphone.
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  remoteStream = new MediaStream();

  //get the tracks (video and audio) from the local stream, and each track is added to a peer-connection object
  localStream.getTracks().forEach((track) => {
    console.log(track);
    pc.addTrack(track, localStream);
  });

  console.log(localStream);

  // triggered when a new track is received on the peer-connection
  pc.ontrack = (event) => {
    console.log(event.streams);
    //adds the new track to the remoteStream
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// Offer
callButton.onclick = async () => {
  try {
    // create a Firestore document reference for the RTCcalls collection
    const callDoc = doc(collection(db, 'RTCcalls'));
    callInput.value = callDoc.id; //the callInput element's value is set to the document's ID.

    // triggered when an ICE candidate is found during ICE negotiation
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(event.candidate);
        //adds the candidate to the offer candidates
        await addDoc(collection(db, 'RTCcalls', callDoc.id, 'offerCandidates'), event.candidate.toJSON());
      }
    };

    // generate an offer for the peer-connection
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);
    console.log(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    //add new offer SDP to the Firestore document
    await setDoc(callDoc, { offer: offer });

    //listen for changes in the callDoc document --> answer SDP
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      console.log('Data: ', data);
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    //listen for changes in the RTCcalls/callDoc.id/answerCandidates collection
    const q = query(collection(db, 'RTCcalls', callDoc.id, 'answerCandidates'));
    onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log('change: ', change);
        if (change.type === 'added') {
          //add new candidate to the peer-connection
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    hangupButton.disabled = false;
  } catch (e) {
    console.log(e);
  }
};

//answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value.toString();
  const callRef = doc(collection(db, 'RTCcalls'), callId); //a reference to the call document in Firestore

  // triggered when an ICE candidate is found during ICE negotiation
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log(event.candidate);
      //adds the candidate to the answer candidates
      await addDoc(collection(db, 'RTCcalls', callId, 'answerCandidates'), event.candidate.toJSON());
    }
  };

  //read the offer candidates
  const callData = (await getDoc(doc(db, 'RTCcalls', callId))).data();
  console.log('callData: ', callData);

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  //create and add new answer SDP to the Firestore document
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callRef, { answer: answer });

  //listens to the "offerCandidates" subcollection within the specific document in the "RTCcalls" collection
  const q = query(collection(db, 'RTCcalls', callRef.id, 'offerCandidates'));
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log('Change: ', change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  hangupButton.disabled = false;
};

hangupButton.onclick = () => {
  console.log(remoteStream);
  pc.close();
  pc = new RTCPeerConnection(servers);

  hangupButton.disabled = true;
  localStream = null;
  remoteStream = null;
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  webcamButton.click();

  callButton.disabled = true;
  answerButton.disabled = true;
  webcamButton.disabled = false;
};

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  setDoc,
  addDoc,
  doc,
  onSnapshot,
  getDoc,
  updateDoc,
  query,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAJk7c-sEBJjNoHHDc1SZDYNjf_joM4ph8",
  authDomain: "webrtc-app-22.firebaseapp.com",
  projectId: "webrtc-app-22",
  storageBucket: "webrtc-app-22.appspot.com",
  messagingSenderId: "1067771785566",
  appId: "1:1067771785566:web:3feba0ea642df2caa39fcf",
  measurementId: "G-L619BTVXJC",
};

//Firestore database
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
        "stun.ekiga.net",
        "stun.ideasip.com",
        "stun.rixtelecom.se",
        "stun.schlund.de",
        "stun.stunprotocol.org:3478",
        "stun.voiparound.com",
        "stun.voipbuster.com",
        "stun.voipstunt.com",
        "stun.voxgratia.org",
      ],
    },
    {
      url: "turn:numb.viagenie.ca",
      credential: "muazkh",
      username: "webrtc@live.com",
    },
    {
      url: "turn:192.158.29.39:3478?transport=udp",
      credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
      username: "28224511:1379330808",
    },
    {
      url: "turn:192.158.29.39:3478?transport=tcp",
      credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
      username: "28224511:1379330808",
    },
    {
      url: "turn:turn.bistri.com:80",
      credential: "homeo",
      username: "homeo",
    },
    {
      url: "turn:turn.anyfirewall.com:443?transport=tcp",
      credential: "webrtc",
      username: "webrtc",
    },
  ],
  iceCandidatePoolSize: 9,
};

let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");

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
    const callDoc = doc(collection(db, "RTCcalls"));
    callInput.value = callDoc.id; //the callInput element's value is set to the document's ID.

    // triggered when an ICE candidate is found during ICE negotiation
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(event.candidate);
        //adds the candidate to the offer candidates
        await addDoc(
          collection(db, "RTCcalls", callDoc.id, "offerCandidates"),
          event.candidate.toJSON()
        );
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
      console.log("Data: ", data);
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    //listen for changes in the RTCcalls/callDoc.id/answerCandidates collection
    const q = query(collection(db, "RTCcalls", callDoc.id, "answerCandidates"));
    onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log("change: ", change);
        if (change.type === "added") {
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
  const callRef = doc(collection(db, "RTCcalls"), callId); //a reference to the call document in Firestore

  // triggered when an ICE candidate is found during ICE negotiation
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log(event.candidate);
      //adds the candidate to the answer candidates
      await addDoc(
        collection(db, "RTCcalls", callId, "answerCandidates"),
        event.candidate.toJSON()
      );
    }
  };

  //read the offer candidates
  const callData = (await getDoc(doc(db, "RTCcalls", callId))).data();
  console.log("callData: ", callData);

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
  const q = query(collection(db, "RTCcalls", callRef.id, "offerCandidates"));
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log("Change: ", change);
      if (change.type === "added") {
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

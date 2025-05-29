const localVideo = document.getElementById('localvideo');
const remoteVideo = document.getElementById('remotevideo');
const roomdetailsElement = document.getElementById('roomDetails');
const messageElement = document.getElementById('message');

let localStream, remoteStream;
let peerConnection = null;
let receivedOffer = null;
let connectedUsers = null;
let roomId = null;
let myId = null;
let RemotePeerOffer = null;

const socket = io();

const peerConfiguration = {
    iceServers: [
        {
            urls: ["stun:stun.l.google.com:19302"]
        }
    ]
}

function emitWithAck(event, data) {
    return new Promise((resolve, reject) => {
        socket.emit(event, data, (response) => {
            console.log(response);
            resolve(response);
        });
    });
}

socket.on('message', (message) => {
    receivedMessage = JSON.parse(message);
    if(receivedMessage.type === 'room details') {
        connectedUsers = receivedMessage.room;
        console.log(connectedUsers);
    }
    else if(receivedMessage.type === 'new room id') {
        roomId = receivedMessage.newRoomId;
    }
    else if(receivedMessage.type === 'sender offer') {
        receivedOffer = receivedMessage.offer;
        console.log("received offer: ", receivedOffer);
    }
});

const sendTracks = () => {
    localStream.getTracks().forEach(track => {
        console.log("adding track", track);
        console.log("tracks added to peer connection from local");
        peerConnection.addTrack(track, localStream);
    });
}

const fetchUserMedia = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true})
        localStream = stream;
        localVideo.srcObject = localStream;
    }
    catch (error) {
        console.log("Error accessing media devices.", error);
    }
}

const createConnection = async () => {
    try {
        peerConnection = new RTCPeerConnection(peerConfiguration);

        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;

        peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                console.log("ice candidate generated");
                socket.emit('ice-candidate', {roomId: roomId, candidate: event.candidate, whoSent: 'sender'});
            }
        });

        peerConnection.addEventListener('track', (event) => {
            console.log("remote track received");
            if (event.streams && event.streams[0]) {
                remoteStream.addTrack(event.track);
            } else {
                console.error("No streams found in track event");
            }
        });
    }
    catch (error) {
        console.log("Error creating peer connection:", error);
    }
}

const makeCall = async () => {
    try {
        await fetchUserMedia();

        await createConnection();
        
        myId = socket.id;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        await emitWithAck('create-new-room', myId);
        console.log(roomId);

        roomdetailsElement.innerText = "room id: " + roomId;

        socket.emit('offer', {roomId: roomId, offer: offer});
    }
    catch (error) {
        console.log("Error creating offer:", error);
    }
}

const answerCall = async () => {
    try {
        roomId = document.getElementById('roomId').value;

        if(!roomId) {
            console.log("no room id has been entered");
            messageElement.innerText = "Please enter a valid room ID.";
            return;
        }

        await emitWithAck('get-room', roomId);
        
        if(!connectedUsers || connectedUsers.senderId == null) {
            console.log("No members in the room. Please check if the room exists");
            messageElement.innerText = "No members in the room. Please check if the room exists.";
            return;
        }

        document.getElementById('roomId').value = "";
        messageElement.innerText = "";

        console.log(connectedUsers);

        await emitWithAck('get-sender-offer', roomId);

        await fetchUserMedia();

        await createConnection();

        myId = socket.id;

        await emitWithAck('add-receiver', {roomId: roomId, receiverId: myId});
        roomdetailsElement.innerText = "room id: " + roomId;

        await peerConnection.setRemoteDescription(receivedOffer);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', {roomId: roomId, answer: answer});
        socket.emit('initiate-track-transfer', roomId); // i think we should re-negotiate the offer to transfer tracks
    }
    catch (error) {
        console.log("Error answering call:", error);
    }
}

const addIceCandidate = async (candidate) => {
    try {
        console.log("adding received icecandidate");
        console.log(candidate);
        await peerConnection.addIceCandidate(candidate);
    }
    catch (error) {
        console.log("Error adding ICE candidate:", error);
    }
}

const addAnswer = async (answer) => {
    try {
        await peerConnection.setRemoteDescription(answer);
    }
    catch (error) {
        console.log("Error setting remote description:", error);
    }
}

const disconnect = () => {
    closeConnections();
    socket.emit('stop', roomId);
}

const closeConnections = () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    remoteStream = null;
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    roomdetailsElement.innerText = "";
}

socket.on('answer', (answer) => {
    addAnswer(answer);
    console.log("answer has been received");
});

socket.on('offer', (offer) => {
    receivedOffer = offer;
    console.log("offer has been received");
});

socket.on('ice-candidate', (candidate) => {
    addIceCandidate(candidate);
    console.log("ice candidate received");
});

socket.on('stop', () => {
    closeConnections();
    console.log("call disconnected");
});

socket.on('transfer tracks', () => {
    console.log("transferring tracks");
    sendTracks();
});
/*
*  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
*
*  Use of this source code is governed by a BSD-style license
*  that can be found in the LICENSE file in the root of the source
*  tree.
*/

'use strict';

const motionVideo = document.getElementById('motionVideo');
const detailVideo = document.getElementById('detailVideo');

let srcStream;
let motionStream;
let detailStream;

const offerOptions = {
  offerToReceiveAudio: 0,
  offerToReceiveVideo: 1
};

localStorage.demioBitrate = localStorage.demioBitrate || 200

function showHint () {
  document.querySelector('.hint').innerText = 'The settings are now locked. A browser refresh is required to start a new test.'
}

document.querySelector('#demio-bitrate').addEventListener('blur', function () {
  localStorage.demioBitrate = this.value
  showHint()
  document.querySelectorAll('.demio-bitrate').forEach((element) => {
    element.innerHTML = this.value
  })
})

async function maybeCreateStream(type) {
  if (srcStream) {
    return;
  }

  if (type !== 'screen') {  
    srcStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    })
  }
  if (type === 'screen') {
    srcStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    })
  }
  document.querySelector('#demio-bitrate').disabled = true
  showHint()
  call();
}


function setVideoTrackContentHints(stream, hint) {
  const tracks = stream.getVideoTracks();
  tracks.forEach(track => {
    if ('contentHint' in track) {
      track.contentHint = hint;
      if (track.contentHint !== hint) {
        console.log('Invalid video track contentHint: \'' + hint + '\'');
      }
    } else {
      console.log('MediaStreamTrack contentHint attribute not supported');
    }
  });
}

function call() {
  // This creates multiple independent PeerConnections instead of multiple
  // streams on a single PeerConnection object so that b=AS (the bitrate
  // constraints) can be applied independently.
  motionStream = srcStream.clone();
  // TODO(pbos): Remove fluid when no clients use it, motion is the newer name.
  // setVideoTrackContentHints(motionStream, 'fluid');
  setVideoTrackContentHints(motionStream, 'motion');
  establishPC(motionVideo, motionStream);
  detailStream = srcStream.clone();
  // TODO(pbos): Remove detailed when no clients use it, detail is the newer
  // name.
  // setVideoTrackContentHints(detailStream, 'detailed');
  setVideoTrackContentHints(detailStream, 'detail');
  establishPC(detailVideo, detailStream);
}

function establishPC(videoTag, stream) {
  const pc1 = new RTCPeerConnection(null);
  const pc2 = new RTCPeerConnection(null);
  pc1.onicecandidate = e => {
    onIceCandidate(pc1, pc2, e);
  };
  pc2.onicecandidate = e => {
    onIceCandidate(pc2, pc1, e);
  };
  pc2.ontrack = event => {
    if (videoTag.srcObject !== event.streams[0]) {
      videoTag.srcObject = event.streams[0];
    }
  };

  stream.getTracks().forEach(track => pc1.addTrack(track, stream));

  pc1.createOffer(offerOptions)
      .then(desc => {
        pc1.setLocalDescription(desc)
            .then(() => pc2.setRemoteDescription(desc))
            .then(() => pc2.createAnswer())
            .then(answerDesc => onCreateAnswerSuccess(pc1, pc2, answerDesc))
            .catch(onSetSessionDescriptionError);
      })
      .catch(e => console.log('Failed to create session description: ' + e.toString()));
}

function onSetSessionDescriptionError(error) {
  console.log('Failed to set session description: ' + error.toString());
}

function onCreateAnswerSuccess(pc1, pc2, desc) {
  // Hard-code video bitrate to 50kbps.
  const demioBitrate = localStorage.demioBitrate
  desc.sdp = desc.sdp.replace(/a=mid:(.*)\r\n/g, 'a=mid:$1\r\nb=AS:' + demioBitrate + '\r\n');
  pc2.setLocalDescription(desc)
      .then(() => pc1.setRemoteDescription(desc))
      .catch(onSetSessionDescriptionError);
}

function onIceCandidate(pc, otherPc, event) {
  otherPc.addIceCandidate(event.candidate);
}

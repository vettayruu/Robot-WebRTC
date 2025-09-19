// get DOM elements
var dataChannelLog = document.getElementById('data-channel'),
    iceConnectionLog = document.getElementById('ice-connection-state'),
    iceGatheringLog = document.getElementById('ice-gathering-state'),
    signalingLog = document.getElementById('signaling-state'),
    robotLog = document.getElementById('robot-log');

// peer connection
var pc = null;

// data channel
var dc = null, dcInterval = null;

function createPeerConnection() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    pc = new RTCPeerConnection(config);

    // register some listeners to help debugging
    pc.addEventListener('icegatheringstatechange', () => {
        iceGatheringLog.textContent += ' -> ' + pc.iceGatheringState;
    }, false);
    iceGatheringLog.textContent = pc.iceGatheringState;

    pc.addEventListener('iceconnectionstatechange', () => {
        iceConnectionLog.textContent += ' -> ' + pc.iceConnectionState;
    }, false);
    iceConnectionLog.textContent = pc.iceConnectionState;

    pc.addEventListener('signalingstatechange', () => {
        signalingLog.textContent += ' -> ' + pc.signalingState;
    }, false);
    signalingLog.textContent = pc.signalingState;

    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind == 'video')
            document.getElementById('video').srcObject = evt.streams[0];
        else
            document.getElementById('audio').srcObject = evt.streams[0];
    });

    return pc;
}

function enumerateInputDevices() {
    const populateSelect = (select, devices) => {
        let counter = 1;
        devices.forEach((device) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || ('Device #' + counter);
            select.appendChild(option);
            counter += 1;
        });
    };

    navigator.mediaDevices.enumerateDevices().then((devices) => {
        populateSelect(
            document.getElementById('audio-input'),
            devices.filter((device) => device.kind == 'audioinput')
        );
        populateSelect(
            document.getElementById('video-input'),
            devices.filter((device) => device.kind == 'videoinput')
        );
    }).catch((e) => {
        alert(e);
    });
}

function negotiate() {
    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        // wait for ICE gathering to complete
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        var codec;

        codec = document.getElementById('audio-codec').value;
        if (codec !== 'default') {
            offer.sdp = sdpFilterCodec('audio', codec, offer.sdp);
        }

        codec = document.getElementById('video-codec').value;
        if (codec !== 'default') {
            offer.sdp = sdpFilterCodec('video', codec, offer.sdp);
        }

        document.getElementById('offer-sdp').textContent = offer.sdp;
        return fetch('/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
                video_transform: document.getElementById('video-transform').value,
                client_type: "web_controller",  // 标识为网页控制器
                robot_id: "robot1"              // 可以动态设置
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then((response) => {
        return response.json();
    }).then((answer) => {
        document.getElementById('answer-sdp').textContent = answer.sdp;
        return pc.setRemoteDescription(answer);
    }).catch((e) => {
        alert(e);
    });
}

function start() {
    document.getElementById('start').style.display = 'none';

    document.getElementById('send-message').onclick = function() {
        if (dc && dc.readyState === "open") {
            var msg = document.getElementById('custom-message').value;
            dc.send(msg);
            dataChannelLog.textContent += '> ' + msg + '\n';
        } else {
            alert("DataChannel Not Open！");
        }
    };

    document.getElementById('send-joint-data').onclick = function() {
        if (dc && dc.readyState === "open") {
            var jointData = {
                timestamp: Date.now(),
                joint1: parseInt(document.getElementById('joint1').value),
                joint2: parseInt(document.getElementById('joint2').value),
                joint3: parseInt(document.getElementById('joint3').value),
                gripper: parseFloat(document.getElementById('gripper').value)
            };
            
            var message = JSON.stringify(jointData);
            dc.send(message);
            
            // 显示发送的数据
            robotLog.textContent += '[SENT] ' + new Date().toLocaleTimeString() + 
                                  ' - Joint Data: ' + JSON.stringify(jointData) + '\n';
            robotLog.scrollTop = robotLog.scrollHeight;
            
            dataChannelLog.textContent += '> ' + message + '\n';
        } else {
            alert("DataChannel Not Open！");
        }
    };

    // 添加滑块值变化监听
    ['joint1', 'joint2', 'joint3', 'gripper'].forEach(id => {
        const slider = document.getElementById(id);
        const valueSpan = document.getElementById(id + '-value');
        slider.addEventListener('input', () => {
            valueSpan.textContent = slider.value;
        });
    });

    pc = createPeerConnection();

    var time_start = null;

    const current_stamp = () => {
        if (time_start === null) {
            time_start = new Date().getTime();
            return 0;
        } else {
            return new Date().getTime() - time_start;
        }
    };

    // if (document.getElementById('use-datachannel').checked) {
    //     var parameters = JSON.parse(document.getElementById('datachannel-parameters').value);

    //     dc = pc.createDataChannel('chat', parameters);
    //     dc.addEventListener('close', () => {
    //         clearInterval(dcInterval);
    //         dataChannelLog.textContent += '- close\n';
    //     });
    //     dc.addEventListener('open', () => {
    //         dataChannelLog.textContent += '- open\n';
    //         dcInterval = setInterval(() => {
    //             var message = 'ping ' + current_stamp();
    //             dataChannelLog.textContent += '> ' + message + '\n';
    //             dc.send(message);
    //         }, 1000);
    //     });
    //     dc.addEventListener('message', (evt) => {
    //         dataChannelLog.textContent += '< ' + evt.data + '\n';

    //         if (evt.data.substring(0, 4) === 'pong') {
    //             var elapsed_ms = current_stamp() - parseInt(evt.data.substring(5), 10);
    //             dataChannelLog.textContent += ' RTT ' + elapsed_ms + ' ms\n';
    //         }
    //     });
    // }

    if (document.getElementById('use-datachannel').checked) {
        var parameters = JSON.parse(document.getElementById('datachannel-parameters').value);

        dc = pc.createDataChannel('robot_control', parameters); // 改为 robot_control
        dc.addEventListener('close', () => {
            clearInterval(dcInterval);
            dataChannelLog.textContent += '- close\n';
            robotLog.textContent += '[INFO] DataChannel closed\n';
        });
        
        dc.addEventListener('open', () => {
            dataChannelLog.textContent += '- open\n';
            robotLog.textContent += '[INFO] Robot control channel opened\n';
            
            // 如果需要自动ping，可以保留这部分
            // dcInterval = setInterval(() => {
            //     var message = 'ping ' + current_stamp();
            //     dataChannelLog.textContent += '> ' + message + '\n';
            //     dc.send(message);
            // }, 1000);
        });
        
        dc.addEventListener('message', (evt) => {
            dataChannelLog.textContent += '< ' + evt.data + '\n';
            
            // 处理机器人反馈数据
            try {
                var data = JSON.parse(evt.data);
                if (data.joint1 !== undefined || data.timestamp !== undefined) {
                    // 这是机器人关节角数据
                    robotLog.textContent += '[RECEIVED] ' + new Date().toLocaleTimeString() + 
                                          ' - Robot Feedback: ' + JSON.stringify(data) + '\n';
                    robotLog.scrollTop = robotLog.scrollHeight;
                }
            } catch (e) {
                // 如果不是 JSON，可能是普通消息
                if (evt.data.startsWith('pong')) {
                    var elapsed_ms = current_stamp() - parseInt(evt.data.substring(5), 10);
                    dataChannelLog.textContent += ' RTT ' + elapsed_ms + ' ms\n';
                } else {
                    robotLog.textContent += '[MESSAGE] ' + new Date().toLocaleTimeString() + 
                                          ' - ' + evt.data + '\n';
                    robotLog.scrollTop = robotLog.scrollHeight;
                }
            }
        });
    }

    // Build media constraints.

    const constraints = {
        audio: false,
        video: false
    };

    if (document.getElementById('use-audio').checked) {
        const audioConstraints = {};

        const device = document.getElementById('audio-input').value;
        if (device) {
            audioConstraints.deviceId = { exact: device };
        }

        constraints.audio = Object.keys(audioConstraints).length ? audioConstraints : true;
    }

    if (document.getElementById('use-video').checked) {
        const videoConstraints = {};

        const device = document.getElementById('video-input').value;
        if (device) {
            videoConstraints.deviceId = { exact: device };
        }

        const resolution = document.getElementById('video-resolution').value;
        if (resolution) {
            const dimensions = resolution.split('x');
            videoConstraints.width = parseInt(dimensions[0], 0);
            videoConstraints.height = parseInt(dimensions[1], 0);
        }

        constraints.video = Object.keys(videoConstraints).length ? videoConstraints : true;
    }

    // Acquire media and start negociation.

    if (constraints.audio || constraints.video) {
        if (constraints.video) {
            document.getElementById('media').style.display = 'block';
        }
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            stream.getTracks().forEach((track) => {
                pc.addTrack(track, stream);
            });
            return negotiate();
        }, (err) => {
            alert('Could not acquire media: ' + err);
        });
    } else {
        negotiate();
    }

    document.getElementById('stop').style.display = 'inline-block';
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    // close data channel
    if (dc) {
        dc.close();
    }

    // close transceivers
    if (pc.getTransceivers) {
        pc.getTransceivers().forEach((transceiver) => {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    // close local audio / video
    pc.getSenders().forEach((sender) => {
        sender.track.stop();
    });

    // close peer connection
    setTimeout(() => {
        pc.close();
    }, 500);
}

function sdpFilterCodec(kind, codec, realSdp) {
    var allowed = []
    var rtxRegex = new RegExp('a=fmtp:(\\d+) apt=(\\d+)\r$');
    var codecRegex = new RegExp('a=rtpmap:([0-9]+) ' + escapeRegExp(codec))
    var videoRegex = new RegExp('(m=' + kind + ' .*?)( ([0-9]+))*\\s*$')

    var lines = realSdp.split('\n');

    var isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var match = lines[i].match(codecRegex);
            if (match) {
                allowed.push(parseInt(match[1]));
            }

            match = lines[i].match(rtxRegex);
            if (match && allowed.includes(parseInt(match[2]))) {
                allowed.push(parseInt(match[1]));
            }
        }
    }

    var skipRegex = 'a=(fmtp|rtcp-fb|rtpmap):([0-9]+)';
    var sdp = '';

    isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var skipMatch = lines[i].match(skipRegex);
            if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
                continue;
            } else if (lines[i].match(videoRegex)) {
                sdp += lines[i].replace(videoRegex, '$1 ' + allowed.join(' ')) + '\n';
            } else {
                sdp += lines[i] + '\n';
            }
        } else {
            sdp += lines[i] + '\n';
        }
    }

    return sdp;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

enumerateInputDevices();
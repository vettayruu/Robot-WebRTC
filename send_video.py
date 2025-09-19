# 另存为 send_video.py
import asyncio
import cv2
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.signaling import BYE
from av import VideoFrame
import aiohttp
import json

class CameraStreamTrack(MediaStreamTrack):
    kind = "video"
    def __init__(self):
        super().__init__()
        self.cap = cv2.VideoCapture(0)
    async def recv(self):
        pts, time_base = await self.next_timestamp()
        ret, frame = self.cap.read()
        print("camera open")
        if not ret:
            raise Exception("Camera read failed")
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        video_frame = VideoFrame.from_ndarray(frame, format="rgb24")
        video_frame.pts = pts
        video_frame.time_base = time_base
        return video_frame
    def stop(self):
        self.cap.release()
        super().stop()

async def run():
    pc = RTCPeerConnection()
    video_track = CameraStreamTrack()
    pc.addTrack(video_track)

    # 创建 offer
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    # 发送 offer 到 server.py
    async with aiohttp.ClientSession() as session:
        params = {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type,
            "video_transform": "none"  # 可选: cartoon/edges/rotate/none
        }
        async with session.post("http://127.0.0.1:8080/offer", json=params) as resp:
            answer = await resp.json()
    await pc.setRemoteDescription(
        RTCSessionDescription(sdp=answer["sdp"], type=answer["type"])
    )

    # 等待直到关闭
    await asyncio.sleep(300)
    await pc.close()

if __name__ == "__main__":
    asyncio.run(run())
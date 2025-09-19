import asyncio
import json
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription


class RobotController:
    def __init__(self, server_url="http://127.0.0.1:8080/offer", robot_id="robot1"):
        self.server_url = server_url
        self.robot_id = robot_id
        self.pc = None
        self.control_channel = None

    async def connect(self):
        self.pc = RTCPeerConnection()

        # 创建控制通道
        self.control_channel = self.pc.createDataChannel("robot_control")

        @self.control_channel.on("open")
        def on_open():
            print(f"控制通道已打开，可以发送关节角数据")

        @self.control_channel.on("message")
        def on_message(message):
            print(f"收到回复: {message}")

        # 创建 offer
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        # 发送 offer 到服务器
        async with aiohttp.ClientSession() as session:
            async with session.post(
                    self.server_url,
                    json={
                        "sdp": self.pc.localDescription.sdp,
                        "type": self.pc.localDescription.type,
                        "client_type": "controller",
                        "robot_id": self.robot_id
                    }
            ) as resp:
                answer = await resp.json()

        await self.pc.setRemoteDescription(
            RTCSessionDescription(sdp=answer["sdp"], type=answer["type"])
        )

        print(f"控制端已连接到服务器，等待通道打开...")

    def send_joint_angles(self, joint_data):
        """发送关节角数据

        Args:
            joint_data: 字典，包含关节角度数据，例如：
                        {"joint1": 90, "joint2": 45, "joint3": 180}
        """
        if self.control_channel and self.control_channel.readyState == "open":
            self.control_channel.send(json.dumps(joint_data))
            print(f"已发送关节角数据: {joint_data}")
        else:
            print("控制通道未打开，无法发送数据")

    async def close(self):
        if self.pc:
            await self.pc.close()
            self.pc = None
            self.control_channel = None


async def main():
    controller = RobotController()
    await controller.connect()

    # 等待通道打开
    await asyncio.sleep(2)

    # 发送示例关节角数据
    for i in range(5):
        # 模拟关节角度数据
        joint_data = {
            "timestamp": i,
            "joint1": 90 + i * 10,
            "joint2": 45 - i * 5,
            "joint3": 180,
            "gripper": 0.5 + i * 0.1
        }
        controller.send_joint_angles(joint_data)
        await asyncio.sleep(1)

    # 保持连接
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("关闭连接...")
        await controller.close()


if __name__ == "__main__":
    asyncio.run(main())
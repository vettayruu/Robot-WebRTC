import asyncio
import json
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription


class RobotReceiver:
    def __init__(self, server_url="http://127.0.0.1:8080/offer", robot_id="robot1"):
        self.server_url = server_url
        self.robot_id = robot_id
        self.pc = None

        # 回调函数，当收到关节角数据时调用
        self.on_joint_data_callback = None

    async def connect(self):
        self.pc = RTCPeerConnection()

        # 创建控制通道
        channel = self.pc.createDataChannel("robot_control") # channel label

        @channel.on("open")
        def on_open():
            print(f"Channel Open: {channel.label}")

        @channel.on("message")
        def on_message(message):
            # print(f"[DEBUG] 收到原始消息: {message}")
            try:
                data = json.loads(message) if isinstance(message, str) else message
                # print(f"[DEBUG] 收到关节角数据: {data}")
                if self.on_joint_data_callback:
                    self.on_joint_data_callback(data)
            except Exception as e:
                print(f"[DEBUG] 处理消息时出错: {str(e)}")

        # @self.pc.on("datachannel")

        # def on_datachannel(channel):
        #     print(f"[DEBUG] 收到数据通道: {channel.label}")
        #
        #     @channel.on("open")
        #     def on_open():
        #         print(f"[DEBUG] 通道 {channel.label} 已打开")
        #
        #     @channel.on("close")
        #     def on_close():
        #         print(f"[DEBUG] 通道 {channel.label} 已关闭")
        #
        #     @channel.on("message")
        #     def on_message(message):
        #         print(f"[DEBUG] 收到原始消息: {message}")
        #         try:
        #             data = json.loads(message) if isinstance(message, str) else message
        #             print(f"[DEBUG] 收到关节角数据: {data}")
        #             if self.on_joint_data_callback:
        #                 self.on_joint_data_callback(data)
        #         except Exception as e:
        #             print(f"[DEBUG] 处理消息时出错: {str(e)}")

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
                        "client_type": "receiver",
                        "robot_id": self.robot_id,
                        "video_transform": "none"
                    }
            ) as resp:
                answer = await resp.json()

        await self.pc.setRemoteDescription(
            RTCSessionDescription(sdp=answer["sdp"], type=answer["type"])
        )

        print(f"接收端已连接到服务器，等待关节角数据...")

    def set_joint_data_callback(self, callback):
        """设置关节角数据回调函数

        Args:
            callback: 回调函数，接收一个参数(joint_data)
        """
        self.on_joint_data_callback = callback

    async def close(self):
        if self.pc:
            await self.pc.close()
            self.pc = None


async def main():
    receiver = RobotReceiver()

    # 设置数据回调
    def handle_joint_data(data):
        # 这里可以控制实际机器人
        print(f"Control Robot Here: {data}")
        # 例如：robot.move_joint(data["joint1"], data["joint2"], ...)

    receiver.set_joint_data_callback(handle_joint_data)

    # 连接到服务器
    await receiver.connect()

    # 保持连接
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("关闭连接...")
        await receiver.close()


if __name__ == "__main__":
    asyncio.run(main())
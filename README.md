
> 本文延续前作：[JS 也能写外挂？5 行代码改掉《植物大战僵尸》的阳光值！](https://github.com/chinjiaqing/pvz-tools)，这次我们瞄准的是 FPS 神作 **CS2**，实现一个简洁的「人物透视 + 方框」 程序。


## 声明

本文仅作为技术交流，请务用于非法用途。

## 🧠 实现目标

1. ✅ 使用 Node.js 操作并读取 **64 位程序内存数据**
2. ✅ 使用 Node.js 调用 **Windows API 进行绘图（方框）**
3. ✅ 使用 **Electron** 打包为可视化操作的 `.exe` 程序

---

## ❓ 常见问题解答

### 💭 如何获取游戏内存地址（基址）？

我们一般使用 [Cheat Engine（CE）](https://cheatengine.org/) 进行扫描，这部分操作**和语言无关**。直接去 B 站搜索《CE 教程》可快速上手。

### 💭 Electron 打包太大怎么办？

体积是 Electron 的通病，但这不是本文重点。Node.js 操作内存本身就是“非主流”实现路线，**主要是分享一种可行的思路**，你甚至完全可以用 CLI 实现这个外挂功能。

---

## 🚀 实战开始！

> 👇建议直接拉取完整仓库进行调试。

📦 GitHub 地址：
- CS2 画框 Demo：<https://github.com/chinjiaqing/csgo-esp>
- GDI 绘图模块 `koffi-boxman`：<https://github.com/chinjiaqing/koffi-boxman.git>

![demo](/docs/images/demo.png)

---

## 🧩 游戏数据获取

代码量不是很多，我就直接贴上来了，具体可看代码注释。
```ts
import memoryJs from "memoryprocess";
import type { Process, Module } from "memoryprocess";

/**
 * 定义Player
 */
interface PlayerInfo {
	id: number;
	x: number;
	y: number;
	z: number;
	health: number;
	fov_y?: number;
	fov_x?: number;
}

const GameExeName = "cs2.exe";

/**
 * 获取进程信息
 * @returns
 */
export function getGameProcessHandler(): Process {
	try {
		const processHandler = memoryJs.openProcess(GameExeName);
		if (!processHandler) {
			throw new Error(`请先打开游戏`);
		}
		return processHandler;
	} catch (err) {
		throw new Error(`请先打开游戏`);
	}
}

/**
 * 获取模块基址
 * @param handler
 * @param moduleName
 * @returns
 */
function getModuleBaseAddr(handler: Process, moduleName: string = GameExeName): number | null {
	const nameStr = moduleName.toLocaleLowerCase();
	const modules = memoryJs.getModules(handler.th32ProcessID) as Module[];
	const mod = modules.find((m) => m.szModule.toLowerCase() === nameStr);
	return mod?.modBaseAddr || null;
}

/**
 * 获取玩家人数
 */
export function Game_GetPlayerCount(handler: Process): number {
	const modBaseAddr = getModuleBaseAddr(handler, "server.dll");
	if (!modBaseAddr) return 0;
	const data = memoryJs.readMemory(handler.handle, modBaseAddr + 0x166f99c, "dword");
	return data || 0;
}

/**
 * 通过遍历来获取玩家信息
 * @param handler
 * @param count
 * @returns
 */
export function Game_GetPlayersInfo(handler: Process, count: number): PlayerInfo[] {
	const players: PlayerInfo[] = [];
	const modBaseAddr = getModuleBaseAddr(handler, "client.dll");
	if (!modBaseAddr) return [];
	console.log(`获取玩家数量： ${count}`);

	let basePtr = modBaseAddr + 0x1b01dc8;
	/****
	 * Cs2中的玩家信息是挨着的，每个玩家信息可以理解为一个Object.
	 * 第一个Player为玩家自己，位置为basePrt + 0x8,后面的每一个玩家都在此基础上每次再加0x10
	 * {Player1},{Player2},{Player3}...
	 * +0x8      +0x18      +0x20
	 */
	for (let i = 0; i < count; i++) {
		let playerBasePtr = basePtr + 0x8 + i * 0x10;

        // 上面的内存地址playerBasePtr里面存的数据便是指向玩家Player结构体的地址，注意64位程序读取时应采"int64"，返回类型为Bigint
		let playerBaseAddr = memoryJs.readMemory(handler.handle, playerBasePtr as unknown as number, "int64");

		if (!playerBaseAddr) {
			continue;
		}

		/**
		 * 读取血量，4字节
		 */
		const health = memoryJs.readMemory(
			handler.handle,
			(playerBaseAddr! + BigInt(0xb5c)) as unknown as number,
			"dword"
		)!;

		/**
		 * 读取世界x坐标，单浮点数
		 */
		const x = memoryJs.readMemory(handler.handle, (playerBaseAddr! + BigInt(0xf58)) as unknown as number, "float")!;
		/**
		 * 读取世界y坐标，单浮点数
		 */
		const y = memoryJs.readMemory(handler.handle, (playerBaseAddr! + BigInt(0xf5c)) as unknown as number, "float")!;
		/**
		 * 读取世界z坐标，单浮点数
		 */
		const z = memoryJs.readMemory(handler.handle, (playerBaseAddr! + BigInt(0xf60)) as unknown as number, "float")!;
		const player: PlayerInfo = {
			id: i,
			health: health,
			x,
			y,
			z,
		};

		// 只有玩家自己才有视角信息
		if (i === 0) {
			const angPtr = modBaseAddr + 0x1d0eb18;
            /**
             * 读取当前玩家的视角信息，可以单独拧出来，我这里干脆写在Player里面了
             */
			const angY = memoryJs.readMemory(handler.handle, angPtr, "float");
			const angX = memoryJs.readMemory(handler.handle, angPtr + 0x4, "float");
			player.fov_y = angY;
			player.fov_x = angX;
		}

		players.push(player);
	}

	console.log("玩家信息:", JSON.stringify(players, null, 2));
	return players;
}

```

#### ⚠️注意点

跟植物大战僵尸不同，cs2为64位程序，所以读取8字节时采用`int64`类型，返回结果为`Bigint`。在处理偏移时也需要将16进制转为`Bigint`，避免精度丢失。

## 画框

### 人物方框计算

简单来说，通过视图矩阵将人物的（x,y,z）世界坐标转换为对应屏幕分辨率的坐标，保证人物在移动过程中不偏框，大小也跟视角一致。

*发文的前一天cs2更新了，之前找的向量基址不生效了，懒得找了，让AI写了个基于视角三角函数的计算*

这里可以自行搜索一下相关的计算方法，基本通用。

### 绘制

通常也称作D3D,Microsoft 提供的图形 API，用于在 Windows 上进行 3D 图形渲染。本文采用的是GDI绘制，性能稍弱于D3D。

```ts
import { getGameProcessHandler, Game_GetPlayerCount, Game_GetPlayersInfo } from './game'
import { Drawer } from './drawer'
import memoryJs from 'memoryprocess'
import { calcPlayerRectSize } from './calc-rect'
import { MyPlayerInfo } from './types'

const drawer = new Drawer()

let running = false
let handler: any = null
let frameCount = 0
let lastFpsTime = Date.now()
let fps = 0

export async function startup() {
    if (running) return

    console.log('启动CS2透视绘制程序...')

    // 初始化绘制器
    if (!(await drawer.initialize())) {
        console.error('初始化绘制器失败')
        return
    }

    // 初始化内存读取
    try {
        handler = getGameProcessHandler()
        console.log('成功连接到游戏进程')
    } catch (error) {
        console.error(error)
        return
    }

    running = true
    console.log('开始主循环...')
    mainLoop().catch((err) => {
        console.error('主循环出错:', err)
        shutdown()
    })
}

export function shutdown() {
    if (!running) return

    running = false
    drawer.cleanup()

    if (handler) {
        memoryJs.closeHandle(handler.handle)
        handler = null
    }

    console.log('程序已关闭')
}

async function mainLoop() {
    while (running) {
        const frameStart = Date.now()
        frameCount++

        try {
            if (!drawer.processMessages()) {
                console.log('收到退出消息')
                shutdown()
                return
            }
            // 开始绘制（捕获背景）
            drawer.beginDraw()

            // 从内存中读取玩家数据
            const playerCount = Game_GetPlayerCount(handler)
            const playerInfos = Game_GetPlayersInfo(handler, playerCount)

            if (playerInfos.length === 0) {
                await delay(100)
                continue
            }

            const basePlayer = playerInfos[0] as MyPlayerInfo // 玩家自己

            // 过滤无效玩家
            const validPlayers = playerInfos

            // 绘制所有目标
            let visibleTargets = 0
            for (const target of validPlayers) {
                if (target.id === 0) continue // 跳过玩家自己
                if (target.health <= 0) continue // 跳过死亡玩家
                const rect = calcPlayerRectSize(
                    basePlayer,
                    target,
                    drawer.screenWidth,
                    drawer.screenHeight
                )
                if (!rect) continue
                // 绘制方框（带距离感知）
                let width = Math.max(1, 20899 / rect.size)
                let height = Math.max(1, 49999 / rect.size)
                drawer.drawPlayerRect(rect.x, rect.y, width, height, target.health)
                // 绘制血量（在方框上方）
                // drawer.drawHealthText(target.health, rect.x, rect.y)
                visibleTargets++
            }

            // 绘制FPS和调试信息
            const now = Date.now()
            if (now - lastFpsTime >= 1000) {
                fps = frameCount
                frameCount = 0
                lastFpsTime = now
            }

            // 总是绘制FPS，即使没有可见目标
            drawer.drawFpsText(fps, visibleTargets, validPlayers.length - 1)
        } catch (error) {
            console.error('绘制过程中出错:', error)
            // 尝试重新获取游戏进程
            try {
                handler = getGameProcessHandler()
                console.log('重新连接到游戏进程')
            } catch (e) {
                console.error('无法重新连接到游戏进程')
                shutdown()
                return
            }
        } finally {
            // 结束绘制（复制到屏幕）
            drawer.endDraw()
        }

        // 精确帧率控制
        const frameTime = Date.now() - frameStart
        const sleepTime = Math.max(0, 16 - frameTime) 
        await delay(sleepTime)
        // await delay(3 * 1000)
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// // 处理退出信号
// process.on("SIGINT", shutdown);

// // 手动启动
// startup().catch(console.error);
```


***

如果你也想使用Nodejs来编写修改器或者脚本，欢迎一起讨论！

![qq.jpg](/docs/images/qq.png)

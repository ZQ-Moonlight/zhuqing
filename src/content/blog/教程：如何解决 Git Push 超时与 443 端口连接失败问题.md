# 教程：如何解决 Git Push 超时与 443 端口连接失败问题

当你在国内使用 GitHub 时，经常会在执行 `git push` 或 `git clone` 时遇到长时间卡顿，最终报出类似下面的超时错误：

Bash

```
fatal: unable to access 'https://github.com/xxxx/xxxx.git/': Failed to connect to github.com port 443 after 21000 ms: Could not connect to server
```

## 🔍 为什么会报错？

很多同学明明电脑已经开启了代理软件（可以正常访问 Google/GitHub 网页），但终端里的 Git 依然连不上。

这是因为 **Git 命令行默认不会自动读取 Windows 系统的代理设置**。当浏览器通过代理通道顺畅访问外网时，Git 依然在尝试“直连” GitHub，从而被防火墙拦截导致超时。

解决这个问题的核心逻辑非常简单：**查出你的本地代理接口，并手动配置给 Git。**

------

## 🛠️ 解决步骤

### 第一步：找出你的本地代理端口

你需要知道你当前代理软件在电脑上开辟的“本地监听端口”是多少。

**方法：使用 PowerShell 查询**

1. 按下 `Win` 键，搜索并打开 **PowerShell**。

2. 复制并运行以下命令：

   PowerShell

   ```
   Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" | Select-Object ProxyEnable, ProxyServer
   ```

3. 查看输出结果。如果 `ProxyServer` 显示为 `127.0.0.1:19828`，那么 **`19828`** 就是你的代理端口。（*注：每台电脑或不同代理软件的端口号可能不同，常见的有 7890、10809 等，请以你查到的为准*）。

### 第二步：让 Git 走本地代理

打开你的终端（Git Bash、VS Code 终端或 PowerShell 均可），输入以下命令为 Git 设置全局代理。

> ⚠️ **注意：** 请把下方命令中的 `19828` 替换成你在第一步查到的真实端口号！

Bash

```
# 设置 HTTP 代理
git config --global http.proxy http://127.0.0.1:19828

# 设置 HTTPS 代理
git config --global https.proxy http://127.0.0.1:19828
```

### 第三步：验证配置并重新推送

配置完成后，可以运行以下命令检查是否设置成功：

Bash

```
git config --global --list
```

如果你在输出的列表中看到了刚刚配置的 `http.proxy` 和 `https.proxy`，说明配置已经生效。

现在，再次执行你的代码推送命令：

Bash

```
git push -u origin main
```

此时你应该能看到代码瞬间推送成功的提示了！

------

## 💡 补充技巧：如何取消 Git 代理？

如果你的网络环境发生了变化（比如出国了、或者换了不需要代理的内网环境），之前设置的代理反而会导致 Git 报错。

这时候，只需运行以下两条命令即可清空 Git 的代理设置，恢复默认直连状态：

Bash

```
git config --global --unset http.proxy
git config --global --unset https.proxy
```
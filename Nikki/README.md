# Nikki (Mihomo) 配置说明

> **策略**：国内（CN / private / 本地域名）允许 **IPv4 + IPv6 双栈**直连；国外（Global / GlobalMedia / AI 等代理组）**强制仅 IPv4** 出口。

---

## 目录

1. [前置条件](#前置条件)
2. [核心思路](#核心思路)
3. [在 OpenWrt Nikki 插件中部署](#在-openwrt-nikki-插件中部署)
4. [验证方法](#验证方法)
5. [常见坑与解决方法](#常见坑与解决方法)
6. [规则逻辑说明](#规则逻辑说明)

---

## 前置条件

| 条件 | 说明 |
|------|------|
| OpenWrt 系统 | 版本 ≥ 21.02，支持 IPv6 转发（`ip6tables` 或 `nftables`） |
| Nikki 插件 | 已安装 `luci-app-nikki`（或 `luci-app-mihomo`） |
| IPv6 拨号 | 光猫桥接 + OpenWrt 直接 PPPoEv6 拨号，或 DHCP-PD 获取到 `/64` 前缀 |
| 代理节点 | 至少一个支持 IPv4 连接的代理节点（服务端不要求必须双栈） |

---

## 核心思路

### 为什么需要这套配置？

默认情况下，Mihomo 在 IPv4/IPv6 双栈环境下可能出现：

- **国外流量走 IPv6 直连**：绕过代理直接访问海外 IPv6 地址，违反代理意图。
- **客户端通过 IPv6 连接代理节点**：部分代理节点仅监听 IPv4，导致连接失败。
- **国内 IPv6 被误拦截**：配置不当导致 NAS、电视等设备的 IPv6 无法正常工作。

### 解决方案

| 机制 | 实现方式 | 作用 |
|------|---------|------|
| 代理组 `ipv6: false` | 在 Global / GlobalMedia / AI 等组添加 | 禁止客户端 → 代理节点之间使用 IPv6 |
| `IP-CIDR6,2000::/3,REJECT,no-resolve` | 放在国内 IPv6 段之后 | 拦截任何试图直连海外 IPv6 地址的流量 |
| 国内运营商 IPv6 段 → DIRECT | 240e/2408/2409/2400:da00/2001:da8 等 | 确保国内 IPv6 不被误伤 |
| DNS `ipv6: true` | DNS 配置中开启 | 允许 DNS 返回 AAAA 记录，国内设备双栈正常工作 |

---

## 在 OpenWrt Nikki 插件中部署

### 步骤 1：确认 Nikki 插件已安装

SSH 登录 OpenWrt，执行：

```bash
opkg list-installed | grep nikki
# 或
opkg list-installed | grep mihomo
```

如未安装：

```bash
opkg update
opkg install luci-app-nikki
# 重新加载 LuCI
/etc/init.d/rpcd restart
```

### 步骤 2：上传配置文件

Nikki 的配置文件默认路径为：

```
/etc/nikki/config.yaml
```

> 不同版本可能略有差异，请在 LuCI → Nikki → 状态页面确认实际路径。

**方式 A：通过 LuCI 界面上传**

1. 打开 LuCI → 服务 → Nikki
2. 找到「配置文件」或「主配置」选项卡
3. 将本目录中的 `config.yaml` 内容粘贴或上传

**方式 B：通过 SCP 上传**

```bash
# 在你的电脑上执行
scp config.yaml root@192.168.1.1:/etc/nikki/config.yaml
```

**方式 C：通过 SSH 直接编辑**

```bash
ssh root@192.168.1.1
vi /etc/nikki/config.yaml
# 粘贴配置内容后 :wq 保存
```

### 步骤 3：填入你的代理节点

编辑 `config.yaml`，在 `proxies:` 部分填入你的实际节点信息，例如：

```yaml
proxies:
  - name: "HK-01"
    type: vmess
    server: your.proxy.server
    port: 443
    uuid: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    alterId: 0
    cipher: auto
    tls: true
```

同时在各代理组的 `proxies:` 列表中引用节点名（如 `"HK-01"`）。

### 步骤 4：重载 / 重启 Nikki

**通过 LuCI 界面**

1. LuCI → 服务 → Nikki → 点击「重载配置」或「重启服务」

**通过 SSH 命令行**

```bash
# 重载（不中断现有连接）
/etc/init.d/nikki reload

# 完全重启（会短暂断网）
/etc/init.d/nikki restart
```

**验证服务状态**

```bash
/etc/init.d/nikki status
# 或查看日志
logread | grep nikki
```

---

## 验证方法

### 1. 验证国内 IPv6 正常工作

在局域网设备（PC / 手机）上访问：

- **[test-ipv6.com](https://test-ipv6.com)**：应显示你的 IPv6 地址（运营商 IPv6），得分满分（10/10）。
- **[ip.sb](https://ip.sb)**：切换到 IPv6 模式，应显示运营商 IPv6 地址。

如果 test-ipv6.com 显示失败，请检查 [常见坑 - fake-ip 模式](#坑-1fake-ip-模式下-test-ipv6com-可能失败)。

### 2. 验证国外流量不走 IPv6

**方法 A：访问 ipleak.net**

1. 浏览器访问 `https://ipleak.net`
2. 检查「IP 地址」栏：应只显示代理节点的 **IPv4 地址**，不应出现你的本地 IPv6 地址。
3. 检查「DNS 泄漏」：DNS 服务器应为代理节点的 DNS，而非你的运营商 DNS。

**方法 B：使用 curl 测试**

```bash
# 在 OpenWrt 或局域网设备上执行
# 查看走代理时的出口 IP
curl -s https://ip.sb
# 应返回代理节点的 IPv4 地址

# 尝试 IPv6 访问（应被 REJECT）
curl -6 -s --max-time 5 https://ip.sb
# 应超时或连接被拒绝（REJECT 规则生效）
```

**方法 C：DNS 泄漏检测**

访问 `https://dnsleaktest.com`，点击「Extended Test」，确认 DNS 服务器不包含运营商 DNS（如不应出现 `202.96.x.x` 等电信/联通 DNS）。

### 3. 验证代理流量走 IPv4

```bash
# 通过代理访问 IP 查询服务
curl --proxy http://127.0.0.1:7890 -s https://api.ipify.org
# 应返回代理节点的 IPv4 地址（非本地 IP）

curl --proxy http://127.0.0.1:7890 -s https://api6.ipify.org
# 如代理节点不支持 IPv6，应返回 IPv4 地址（通过 NAT64 或仅 IPv4 访问）
```

---

## 常见坑与解决方法

### 坑 1：fake-ip 模式下 test-ipv6.com 可能失败

**现象**：test-ipv6.com 检测不到 IPv6，提示「No IPv6 address detected」。

**原因**：test-ipv6.com 通过访问多个子域名（`ds.test-ipv6.com`、`ipv6.test-ipv6.com` 等）来检测 IPv6，在 fake-ip 模式下这些域名会返回 fake IP（198.18.x.x），导致检测异常。

**解决方法**：在 `dns.fake-ip-filter` 中添加这些域名：

```yaml
dns:
  fake-ip-filter:
    - '*.test-ipv6.com'
    - 'test-ipv6.com'
```

---

### 坑 2：no-resolve 的含义必须理解

`no-resolve` 表示：该规则**仅匹配直连的 IP 地址**，不会对域名进行 DNS 解析后再匹配。

- `IP-CIDR6,2000::/3,REJECT,no-resolve`：只拦截客户端**直接连接**海外 IPv6 地址的流量。
- 对于通过域名访问的流量（占绝大多数），在 fake-ip 模式下，域名会被分流规则（GEOSITE/RULE-SET）处理，不受此规则影响。
- 这就是为什么代理组加 `ipv6: false` 才是避免"走代理但走 IPv6 隧道"的真正保障。

---

### 坑 3：QUIC / HTTP3 可能绕过 TCP 代理

**现象**：部分网站（如 YouTube、Google）使用 QUIC（UDP 443），而透明代理默认只代理 TCP，导致 QUIC 流量直连并可能使用 IPv6。

**解决方法**（二选一）：

**A. 禁用 QUIC**（推荐，简单有效）

在 OpenWrt 防火墙中阻断 UDP 443：

```bash
# iptables（传统）
iptables -I FORWARD -p udp --dport 443 -j REJECT
ip6tables -I FORWARD -p udp --dport 443 -j REJECT

# nftables（新版 OpenWrt）
nft add rule inet fw4 forward udp dport 443 reject
```

**B. 开启 UDP 透明代理**

在 Mihomo 中启用 TUN 模式，可代理 UDP 流量：

```yaml
tun:
  enable: true
  stack: system       # 或 gvisor、mixed
  dns-hijack:
    - any:53
  auto-route: true
  auto-detect-interface: true
```

---

### 坑 4：dns-hijack 配置错误导致 DNS 泄漏

**现象**：DNS 查询绕过 Mihomo，直接发到运营商 DNS，导致 DNS 泄漏。

**解决方法**：在 OpenWrt 防火墙中重定向 DNS 请求到 Mihomo：

```bash
# 重定向 UDP 53 到 Mihomo DNS 端口（1053）
iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 1053
ip6tables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 1053
```

或在 Mihomo TUN 模式中配置：

```yaml
tun:
  dns-hijack:
    - any:53          # 劫持所有 DNS 请求
```

---

### 坑 5：PPPoE 拨号 MTU 问题

**现象**：网页加载正常但大文件传输慢，或部分网站打不开（典型症状：小文件 OK，大文件超时）。

**原因**：PPPoE 会在以太网帧上添加 8 字节头，使 MTU 从 1500 降到 1492。如果没有正确设置 MSS Clamp，TCP 大包会被分片或丢弃。

**解决方法**：在 OpenWrt 网络 → 接口 → PPPoE 接口 → 高级设置中，将 MSS 设置为 1452（IPv4，计算方式：MTU 1492 - TCP/IP 头部 40 字节 = 1452）或 1432（IPv6，再减去 IPv6 额外头部 20 字节）。

或通过命令行：

```bash
# 为 pppoe-wan 接口设置 MSS clamp
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1452
ip6tables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1432
```

---

### 坑 6：国内 IPv6 段不完整导致误拦截

本配置已包含以下国内 IPv6 段，如有运营商遗漏，请自行补充：

| 运营商 | IPv6 前缀 |
|--------|----------|
| 中国电信 | `240e::/18` |
| 中国移动 | `2408::/18` |
| 中国联通 | `2409::/18` |
| 中国广电 | `2400:da00::/32` |
| 教育网 CERNET | `2001:da8::/32` |

如果你的运营商 IPv6 前缀不在上表中，通过以下命令查看当前 IPv6 地址前缀：

```bash
ip -6 addr show dev pppoe-wan
# 或
ip -6 addr show dev eth0.2   # 根据你的 WAN 接口名称调整
```

然后在 `config.yaml` 的规则部分，在 `IP-CIDR6,2000::/3,REJECT` **之前**添加：

```yaml
- IP-CIDR6,你的运营商IPv6前缀/长度,DIRECT,no-resolve
```

---

## 规则逻辑说明

```
┌─ 本地/私有 IPv4 → DIRECT ──────────────────────────────────┐
│  127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16  │
├─ 私有 IPv6 → DIRECT ───────────────────────────────────────┤
│  ::1/128, fc00::/7, fe80::/10                               │
├─ 国内运营商 IPv6 → DIRECT（双栈直连）─────────────────────────┤
│  240e::/18（电信）, 2408::/18（移动）, 2409::/18（联通）等    │
├─ 海外 IPv6 → REJECT（禁止直连海外 IPv6）───────────────────────┤
│  2000::/3（全球单播，减去上方已放行的国内段）                   │
├─ AI 域名 → AI 代理组（ipv6: false）────────────────────────────┤
│  RULE-SET,ai_domain,AI                                      │
├─ 国内域名/IP → DOMESTIC（DIRECT，允许双栈）────────────────────┤
│  GEOSITE,cn / GEOIP,CN                                      │
└─ 其余 → FallBack（Global 代理，ipv6: false）────────────────────┘
```

### 关键参数说明

| 参数 | 位置 | 作用 |
|------|------|------|
| `ipv6: true`（顶层） | 全局 | 允许内核处理 IPv6 流量 |
| `dns.ipv6: true` | DNS 配置 | 允许 DNS 返回 AAAA 记录 |
| `ipv6: false`（代理组） | 各外网代理组 | 禁止客户端→代理节点之间使用 IPv6 |
| `no-resolve`（IP-CIDR6 规则） | 规则 | 仅匹配直连 IP，不触发 DNS 解析 |

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `config.yaml` | Nikki 主配置文件（可直接使用，需填入代理节点） |
| `Ai.yaml` | AI 服务域名规则集（被 config.yaml 通过 rule-providers 引用） |

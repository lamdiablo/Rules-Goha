# Nikki (Mihomo) 配置说明

> **适用场景**：OpenWrt 软路由 + Nikki 插件，PPPoE 拨号获取 IPv4 + IPv6（PD 前缀），
> 实现"**国内 IPv4+IPv6 双栈直连，国外仅 IPv4 出口**"。

---

## 目录

1. [策略说明](#1-策略说明)
2. [文件说明](#2-文件说明)
3. [前置条件](#3-前置条件)
4. [部署步骤（OpenWrt Nikki）](#4-部署步骤openwrt-nikki)
5. [验证方法](#5-验证方法)
6. [常见坑与解决方案](#6-常见坑与解决方案)
7. [规则逻辑闭环说明](#7-规则逻辑闭环说明)

---

## 1. 策略说明

| 流量类型 | 目标 | 处理方式 |
|----------|------|----------|
| 本地 / 私有地址 | `::1`、`fe80::`、`fc00::/7`、`192.168.0.0/16` 等 | **DIRECT 直连**（IPv4+IPv6 均放行） |
| 国内运营商 IPv6 | 电信 `240e::/18`、联通 `2408::/18`、移动 `2409::/18` | **DIRECT 直连**（双栈） |
| **海外 IPv6** | `2000::/3`（全球单播） | **REJECT 拒绝**（强制 IPv4-only 出口） |
| 国内域名 / IP | GeoSite CN、GeoIP CN | **直连**（IPv4+IPv6 双栈） |
| AI 服务 | OpenAI、Claude、Gemini 等 | **AI 代理组**（代理隧道，IPv4 出站） |
| 其余境外流量 | 未匹配 MATCH | **漏网之鱼代理组**（代理隧道，IPv4 出站） |

### 为什么 `IP-CIDR6,2000::/3,REJECT` 不会误伤国内 IPv6？

规则按顺序匹配，**第一个命中即止**：

```
国内运营商 IPv6（240e::/18 / 2408::/18 / 2409::/18）→ DIRECT  ← 先命中
海外 IPv6（2000::/3）→ REJECT                                  ← 后命中
```

国内运营商 IPv6 属于 `2000::/3` 的子集，但因为先被上面三条规则命中并放行，
永远不会到达 REJECT 规则。

---

## 2. 文件说明

```
Nikki/
├── config.yaml   # 主配置模板（本文档对应的配置文件）
├── Ai.yaml       # AI 服务域名规则集（rule-set payload 格式）
└── README.md     # 本文档
```

**`config.yaml`** 是完整的 Mihomo 主配置，包含：
- DNS（fake-ip + 分域策略）
- 代理组（节点选择、Global、GlobalMedia、AI、国内、漏网之鱼）
- 规则集引用（`Ai.yaml`）
- 完整分流规则（含 IPv6 双栈策略）

**`Ai.yaml`** 是规则集文件（`payload:` 格式），由 `config.yaml` 通过 `rule-providers` 引用。

---

## 3. 前置条件

### 3.1 硬件 / 系统

- OpenWrt 路由器（x86 / ARM），推荐内存 ≥ 256 MB
- 已安装 **Nikki** 软件包（`nikki` + `luci-app-nikki`）
- 已安装 **luci-compat**（部分版本需要）

### 3.2 网络

- PPPoE 拨号已配置，能获取公网 IPv4 地址
- ISP 分配了 IPv6 PD 前缀（`/60` 或 `/56`），LAN 接口已配置 IPv6 RA 和 DHCPv6

### 3.3 代理节点

- 准备好可用的代理节点（VLESS / VMess / Shadowsocks 等）
- 节点服务端建议使用 **IPv4 地址**或解析为 IPv4 的域名
  （若节点域名解析出 AAAA，Nikki 连接时可能使用 IPv6 出站，
  但此时 `IP-CIDR6,2000::/3,REJECT` 会兜底拦截，需确保节点本身走 IPv4）

### 3.4 软件版本

| 组件 | 最低版本 |
|------|---------|
| Mihomo 内核 | 1.18.0 |
| Nikki 插件 | 任意（含 1.x） |
| OpenWrt | 23.05+ |

---

## 4. 部署步骤（OpenWrt Nikki）

### 4.1 获取配置文件

将本仓库 `Nikki/config.yaml` 下载到本地，**按需修改以下部分**：

#### ① 填写代理节点

在 `proxies:` 下填入你的节点配置，例如：

```yaml
proxies:
  - name: "香港 HK01"
    type: vless
    server: hk01.example.com   # ← 节点地址（建议 IPv4 或解析为 IPv4 的域名）
    port: 443
    uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    network: ws
    tls: true
    ws-opts:
      path: /path
```

#### ② 调整代理组

在 `proxy-groups` 的 `节点选择` 中，注释掉 `include-all: true`，
改为手动列出节点名称；或保留 `include-all: true` 由 Mihomo 自动收录。

#### ③ （可选）添加更多规则集

在 `rule-providers` 中追加需要的规则集，并在 `rules` 中插入对应条目。

---

### 4.2 上传配置文件

**方法 A：通过 LuCI 界面上传（推荐小白）**

1. 浏览器打开 OpenWrt LuCI：`http://192.168.1.1`
2. 进入 **服务 → Nikki**
3. 切换到 **配置文件** 标签页
4. 点击"**选择文件**"，上传修改后的 `config.yaml`
5. 点击"**保存**"

**方法 B：通过 SSH 直接上传**

```bash
# 将本地 config.yaml 上传到路由器（在本地电脑执行）
scp config.yaml root@192.168.1.1:/etc/nikki/config.yaml
```

> **路径说明**：Nikki 主配置默认位于 `/etc/nikki/config.yaml`。
> 若使用 UCI 管理，实际路径可能不同，以 LuCI 界面中显示的路径为准。

---

### 4.3 启用 Nikki 并重载

**方法 A：通过 LuCI 界面**

1. 进入 **服务 → Nikki**
2. 勾选"**启用 Nikki**"
3. 点击"**保存并应用**"→ 服务将自动重启

**方法 B：通过 SSH 命令**

```bash
# 重启 Nikki 服务
service nikki restart

# 或者使用 init.d 脚本
/etc/init.d/nikki restart

# 查看运行状态
service nikki status

# 查看实时日志（Ctrl+C 退出）
logread -f | grep nikki
```

**方法 C：热重载（不断开已有连接）**

```bash
# 发送 SIGHUP 信号触发配置热重载（不中断连接）
kill -HUP $(pgrep -x mihomo)
```

---

### 4.4 配置透明代理（TProxy）

Nikki 通常会自动配置 iptables/nftables 规则。如需手动验证，SSH 登录后执行：

```bash
# 查看 TProxy 规则是否生效
ip rule list | grep -i tproxy
nft list table inet nikki 2>/dev/null || iptables -t mangle -L NIKKI_DNS 2>/dev/null
```

---

## 5. 验证方法

### 5.1 验证国内 IPv6 正常（双栈）

在 LAN 侧设备（PC / 手机）上访问：

- **https://test-ipv6.com** → 应显示"10/10"，IPv6 测试全部通过
- **https://ipw.cn** → 应同时显示 IPv4 和 IPv6 地址
- **https://ip.sb** → 可选择 `ipv4.ip.sb` 或 `ipv6.ip.sb` 分别查看

预期结果：

```
IPv4 地址：×.×.×.×（你的公网 IPv4）
IPv6 地址：240e:xxxx:xxxx:xxxx::1（你的国内运营商 IPv6）
```

### 5.2 验证国外流量仅走 IPv4

**方法 A：通过代理节点访问 IP 查询网站**

确保代理组选中了境外节点，然后访问：

- **https://ip.sb** → 显示的应为**节点的 IPv4 地址**，而非 IPv6
- **https://ipv6.ip.sb** → 应**无法访问**或显示超时（节点无 IPv6 出口）
- **https://api64.ipify.org** → 返回节点 IPv4 地址

**方法 B：测试海外 IPv6 连接被拒绝**

在 OpenWrt SSH 中测试：

```bash
# 尝试直接 ping 一个海外 IPv6 地址（应被 REJECT）
ping6 -c 3 2001:4860:4860::8888   # Google DNS IPv6

# 预期：立即返回"Destination unreachable"或"Network unreachable"
# 若超时，说明规则未生效
```

**方法 C：DNS 泄漏检测**

访问 **https://dnsleaktest.com**，点击"Extended Test"：

- 预期：所有 DNS 服务器应位于**中国境内**（阿里云 / 腾讯云），
  或显示代理节点所在地区（若使用了代理侧 DoH）
- 不应出现 ISP 的境外 DNS 服务器

**方法 D：QUIC（HTTP/3）测试**

部分海外网站使用 QUIC（UDP 443）。QUIC 也受 `2000::/3,REJECT` 规则限制，
但 QUIC 流量需确认 Nikki 已接管 UDP（TProxy UDP 模式）：

```bash
# 确认 UDP TProxy 已启用
nft list table inet nikki | grep udp
```

---

## 6. 常见坑与解决方案

### 坑 1：fake-ip 模式下国内 IPv6 不通

**症状**：LAN 设备只拿到假 IPv4，无法使用 IPv6 访问国内服务。

**原因**：`fake-ip-filter` 未覆盖目标域名，或 `dns.ipv6: false`。

**解决**：
1. 确认 `dns.ipv6: true`（配置文件中已默认开启）
2. 在 `fake-ip-filter` 中添加需要双栈的域名（如 NTP、STUN 等）
3. 国内域名通过 `nameserver-policy` → 国内 DoH 解析，会返回真实 AAAA

> **说明**：在 fake-ip 模式下，DNS 返回的是假 IPv4，客户端建立连接后由
> Mihomo 接管并按规则转发。国内域名命中 `GEOSITE,cn → DIRECT`，
> Mihomo 以 DIRECT 模式连接，此时会使用真实 IP（含 IPv6）连接目标。

### 坑 2：`no-resolve` 导致 IP 规则未生效

**症状**：`IP-CIDR6,2000::/3,REJECT,no-resolve` 没有拦截海外 IPv6。

**原因**：`no-resolve` 表示"不主动解析域名来匹配此规则"，
对于已知 IP 的连接（如直连 IPv6 地址）会直接匹配；
对于域名请求，Mihomo 会先匹配域名规则，IP 规则作为兜底。

**解决**：确保域名规则（`GEOSITE`、`RULE-SET`）在 IP 规则之后没有 DIRECT 的境外域名泄漏。
若有大量境外域名走了 DIRECT，应将其移入代理组。

### 坑 3：QUIC 流量绕过了规则

**症状**：浏览器通过 QUIC（UDP）访问了海外 IPv6 地址。

**原因**：TProxy 未接管 UDP 流量，或防火墙规则遗漏了 UDP。

**解决**：
1. 检查 Nikki 插件的 UDP 透明代理设置是否启用
2. 或者，在防火墙规则中拒绝 LAN → WAN 的 UDP IPv6 流量：
   ```bash
   # 临时测试（重启后失效）
   ip6tables -I FORWARD -p udp -d 2000::/3 -j REJECT
   ```
3. 或在浏览器中禁用 QUIC（`chrome://flags/#enable-quic` 设为 Disabled）

### 坑 4：PPPoE 的 MTU 问题导致 IPv6 连接断开

**症状**：IPv6 可 ping 通但 TCP 连接不稳定、大包丢失。

**原因**：PPPoE 封装使实际 MTU 降低（以太网 1500 → PPPoE 1492），
IPv6 默认 MTU 1280 通常没问题，但部分实现会尝试 1500，触发分片问题。

**解决**：
```bash
# 在 OpenWrt 上设置 PPPoE WAN 口的 MSS Clamp
iptables -t mangle -A POSTROUTING -o pppoe-wan -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu

ip6tables -t mangle -A POSTROUTING -o pppoe-wan -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
```

在 LuCI 中：**网络 → 接口 → WAN → 高级设置 → 覆盖 IPv6 MTU** 设为 `1492`。

### 坑 5：dns-hijack 与 dnsmasq 冲突

**症状**：Nikki 启用后，部分设备 DNS 解析失败或始终使用旧 DNS。

**原因**：OpenWrt 默认的 dnsmasq 监听 53 端口，与 Nikki DNS 冲突。

**解决**：
1. 在 LuCI **网络 → DHCP/DNS → 高级设置** 中，将 dnsmasq 监听端口改为 `5335`
2. 或禁用 dnsmasq 的 DNS 功能，仅保留 DHCP
3. Nikki 的 DNS 监听 `0.0.0.0:53`，需要确保 iptables DNS 劫持规则将 UDP/TCP 53 重定向到 Nikki

```bash
# 验证 DNS 监听
ss -ulnp | grep :53
ss -tlnp | grep :53
```

### 坑 6：节点域名解析出 AAAA → 节点连接走 IPv6

**症状**：节点连接使用了 IPv6，导致海外 IPv6 流量未被 REJECT 拦截（隧道内容不受 IP 规则约束）。

**原因**：`proxy-server-nameserver` 返回了节点域名的 AAAA 记录，
Mihomo 优先使用 IPv6 连接节点服务器。

**解决**：
1. 在 `proxy-server-nameserver` 中使用**纯 IPv4 的 DNS 服务器**（本配置已默认如此）
2. 或将节点地址直接写为 IPv4 地址（不使用域名）
3. 配置 `prefer-h3: false` 防止 Mihomo 优先使用 HTTP/3 连接节点

---

## 7. 规则逻辑闭环说明

```
客户端发起连接
      │
      ▼
[TProxy 拦截所有流量]
      │
      ▼
[Mihomo 规则匹配流程]
      │
      ├─ IP 已知（直连 IPv6 地址）
      │         │
      │         ├─ 私有 IPv6（::1 / fe80:: / fc00::）→ DIRECT ✓
      │         ├─ 国内运营商 IPv6（240e:: / 2408:: / 2409::）→ DIRECT ✓
      │         └─ 海外 IPv6（2000::/3）→ REJECT ✗
      │
      └─ 域名请求（fake-ip 返回假 IPv4，Mihomo 匹配域名规则）
                │
                ├─ AI 服务域名（RULE-SET,ai_domain）→ AI 代理组 → 节点（IPv4 隧道）
                ├─ 国内私有域名（GEOSITE,private）→ DIRECT（双栈）
                ├─ 国内域名（GEOSITE,cn）→ 国内代理组 → DIRECT（双栈）
                ├─ 国内 IP（GEOIP,CN）→ 国内代理组 → DIRECT（双栈）
                └─ 其余境外流量（MATCH）→ 漏网之鱼代理组 → 节点（IPv4 隧道）

境外流量出口（代理节点）：
  Mihomo → 代理节点（IPv4 地址/域名解析为 IPv4）→ 目标服务器（IPv4）
  不产生海外 IPv6 连接 ✓
```

---

## 参考资料

- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [OpenWrt Nikki 项目](https://github.com/nikki-project/nikki)
- [MetaCubeX GeoData 规则集](https://github.com/MetaCubeX/meta-rules-dat)
- 本仓库 AI 规则集：[Nikki/Ai.yaml](./Ai.yaml)

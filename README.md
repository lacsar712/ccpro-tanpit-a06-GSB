# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后是按行列铺开的坑位，点坑登记浸液酸碱度并改状态。顶栏可切换「坑位场地图」与「取样桶」专页。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15（行锁 + 事务保证并发扣水） |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

- 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`，只认酸碱带，与取样桶水位无关。
- **取样桶整场共用一只**（OneToOne，同一场现行桶最多一只），种子水位 **0.2 升**，水位必须为不小于 0 的数（DB CheckConstraint 兜底）。
- 顶栏「取样桶」专页：桶形水位（一位小数）、可按场筛选，操作工可看；仅管理员可补水。
- 每成功登记一条酸碱度，必须在**同一事务**内对本场桶行加锁（`select_for_update`）扣 **0.2 升**；水位不足则中文报错挡住、酸碱不入库。改坑态不扣水位。
- 并发两笔抢最后 0.2 升：行锁下只可能一笔成功（水位归 0），另一笔被挡住。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```

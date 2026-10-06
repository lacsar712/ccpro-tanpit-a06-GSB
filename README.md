# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后是按行列铺开的坑位，点坑登记浸液酸碱度并改状态。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

- 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`，放液门槛只认酸碱度。
- 每场共用一只**现行取样桶**（同场现行桶最多一只），水位单位**升**，必须是不小于 0 的数；种子水位 0.2。
- 每成功登记一条酸碱度，在**同一数据库事务**里从本场现行桶扣 **0.2 升**；水位不足 0.2 升时中文报错挡住，酸碱记录不入库（行级锁保证并发只可能一笔成功）。改坑态不扣水。
- 取样桶为独立专页（顶栏进入）：操作工可查看现行水位（一位小数）并按场筛选；仅管理员可补水。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```

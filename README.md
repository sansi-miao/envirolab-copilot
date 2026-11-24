# EnviroLab Copilot

EnviroLab Copilot 是面向大学环境监测实验课的网页工具。学生可以用手机录入实验读数、检查计算与图表，并导出能复核的实验记录。

[在线演示](https://envirolab-copilot-7h5cl15mvjd.qoder.zone/) · [SO₂ 实验](https://envirolab-copilot-7h5cl15mvjd.qoder.zone/#/course?session=5)

## 两分钟演示

1. 打开「环境监测课程」第 5 课次，点击「载入合成样例」。页面展示六点标准曲线和 **0.25 mg/m³** 的教学样例结果。下载 CSV 可以核对原始读数、空白值、采样体积和计算结果。
2. 打开 BOD₅ 的第 6 课次，录入样品信息，再切到第 7 课次。同一浏览器会恢复首段内容，可以继续记录第二次读数。
3. 在「我的项目」新建实验，导入 CSV 或粘贴 Excel 表格，预览后再应用，也可以附上参考照片。

## 实现

| 需求 | 实现 |
| --- | --- |
| 同一样品分两次课测量 | BOD₅ 两个课次共用一份可恢复的浏览器草稿 |
| 计算结果需要复核 | SO₂ 保留六点标准曲线、原始输入、计算参数和 CSV，缺少必要字段时暂停计算 |
| 课程外的随手实验 | 自建表格、导入预览、照片和浏览器本地保存 |
| 评委和同学快速试用 | React、TypeScript 和 Vite 构建的静态版部署于 Qoder Sites，包含 8 个课次和 30 条公开档案 |

目录包括 `web/` 前端、`api/` FastAPI 服务与测试、`data/seeds/` 公开实验数据，以及 `scripts/` 数据校验和导入工具。静态演示使用构建时的实验目录，文献页提供外部检索入口。

## 本地运行

前端需要 Node.js 22.13 及以上的 22.x，或 Node.js 24 及以上。

```sh
cd web
npm ci
npm run test:course
npm run build
npm run preview
```

浏览器打开本地预览地址（默认 `http://127.0.0.1:4173`）。静态版可以直接运行。

从仓库根目录运行以下命令，可用公开种子数据建立本地 SQLite 库并启动独立 API。下例适用于 Windows PowerShell。

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r api/requirements-dev.txt
.venv\Scripts\python scripts/import_seed.py --database data/local-demo.db --apply
$env:DATABASE_URL = "sqlite:///./data/local-demo.db"
$env:PYTHONPATH = "api"
.venv\Scripts\python -m pytest api/tests
.venv\Scripts\python -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

## 创作过程

我用课程表确定实验场景，按 SO₂ 讲义核对计算字段，再用 Qoder 分批实现和验收。我给出的验收条件包括保留空白读数、刷新恢复草稿和导入失败时保留原记录。正式站点通过了 12 组未登录浏览器验收。

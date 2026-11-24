import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Camera, FileSpreadsheet, FlaskConical } from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import {
  MAX_PERSONAL_NAME_LENGTH,
  createPersonalExperiment,
} from "../lib/personalExperiments";

export function NewPersonalExperimentPage() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const experiment = createPersonalExperiment(name);
      window.location.hash = `/projects?experiment=${encodeURIComponent(experiment.id)}`;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "新建失败，请稍后再试。");
    }
  }

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow="My experiment · Browser only"
        title="新建我的实验"
        description="公共实验档案找不到时，先填一个实验名称，就能建立自己的本地记录。进入后可以手填数据，或导入 CSV、TSV 和 Excel 粘贴表格。"
        actions={
          <a className="button button--secondary" href="#/projects">
            <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
            返回我的项目
          </a>
        }
      />

      <section className="personal-new-card" aria-labelledby="personal-new-title">
        <span className="personal-new-card__icon" aria-hidden="true">
          <FlaskConical size={22} strokeWidth={1.5} />
        </span>
        <h2 id="personal-new-title">先给这份实验起个名字</h2>
        <p>
          名称会作为记录标题和 CSV 文件名。表头、单位和数据稍后都能修改，不需要现在想完整。
        </p>
        <form className="personal-new-form" onSubmit={handleSubmit}>
          <label className="course-field">
            <span className="course-field__label">
              实验名称 <em>必填</em>
            </span>
            <input
              className="field course-input"
              value={name}
              maxLength={MAX_PERSONAL_NAME_LENGTH}
              autoFocus
              aria-invalid={Boolean(error) || undefined}
              placeholder="例如：宿舍室内温湿度连续观测"
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
          </label>
          {error && (
            <p role="alert" className="personal-new-form__error">
              {error}
            </p>
          )}
          <div className="personal-new-form__actions">
            <button type="submit" className="button button--primary">
              创建并开始记录
              <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <a className="button button--quiet" href="#/projects">
              取消
            </a>
          </div>
        </form>
        <div className="personal-new-card__steps">
          <span>
            <FileSpreadsheet size={13} strokeWidth={1.5} aria-hidden="true" />
            手填或导入数据
          </span>
          <span>
            <Camera size={13} strokeWidth={1.5} aria-hidden="true" />
            可附一张参考照片
          </span>
          <span>数据、照片只在当前浏览器保存</span>
        </div>
      </section>
    </div>
  );
}
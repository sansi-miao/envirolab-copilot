import { useCallback, useEffect, useState } from "react";

import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import { useHashRoute } from "./hooks/useHashRoute";
import {
  COURSE_SESSION_BOD5_FIRST_ID,
  COURSE_SESSION_BOD5_SECOND_ID,
  COURSE_SESSION_COD_ID,
  COURSE_SESSION_COMFORT_ID,
  COURSE_SESSION_FORMALDEHYDE_ID,
  COURSE_SESSION_ONE_ID,
  COURSE_SESSION_PHENOL_ID,
  COURSE_SESSION_SO2_ID,
} from "./lib/course";
import { getNavigationItem } from "./lib/navigation";
import { AgentWorkflowPage } from "./pages/AgentWorkflowPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { Bod5Page } from "./pages/Bod5Page";
import { CodPage } from "./pages/CodPage";
import { CourseGenericPage } from "./pages/CourseGenericPage";
import { CoursePage } from "./pages/CoursePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { ExperimentOnePage } from "./pages/ExperimentOnePage";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { HomePage } from "./pages/HomePage";
import { ModulePage } from "./pages/ModulePage";
import { NewPersonalExperimentPage } from "./pages/NewPersonalExperimentPage";
import { PersonalExperimentPage } from "./pages/PersonalExperimentPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { So2Page } from "./pages/So2Page";

export default function App() {
  const { route, params } = useHashRoute();
  const current = getNavigationItem(route);
  const [discoverDraft, setDiscoverDraft] = useState("");

  const askResearchQuestion = useCallback((question: string) => {
    setDiscoverDraft(question);
    window.location.hash = "/discover";
  }, []);

  useEffect(() => {
    document.title = `${current.title} · EnviroLab Copilot`;
    window.scrollTo(0, 0);
  }, [current.title]);

  const courseSession = params.get("session")?.trim() ?? "";
  const projectView = params.get("view")?.trim() ?? "";
  const projectExperiment = params.get("experiment")?.trim() ?? "";
  const routeKey = `${route}?${params.toString()}`;

  return (
    <AppShell route={route}>
      <ErrorBoundary resetKey={routeKey}>
        {route === "home" && <HomePage onAskQuestion={askResearchQuestion} />}
        {route === "discover" && <DiscoverPage initialDraft={discoverDraft} />}
        {route === "experiments" && <ExperimentsPage selectedId={params.get("id") ?? ""} />}
        {route === "course" &&
          (courseSession === COURSE_SESSION_ONE_ID ? (
            <ExperimentOnePage />
          ) : courseSession === COURSE_SESSION_COD_ID ? (
            <CodPage />
          ) : courseSession === COURSE_SESSION_SO2_ID ? (
            <So2Page />
          ) : courseSession === COURSE_SESSION_BOD5_FIRST_ID ||
            courseSession === COURSE_SESSION_BOD5_SECOND_ID ? (
            <Bod5Page sessionId={courseSession} />
          ) : courseSession === COURSE_SESSION_FORMALDEHYDE_ID ||
            courseSession === COURSE_SESSION_PHENOL_ID ||
            courseSession === COURSE_SESSION_COMFORT_ID ? (
            <CourseGenericPage sessionId={courseSession} />
          ) : (
            <CoursePage requestedSession={courseSession} />
          ))}
        {route === "analysis" && (
          <AnalysisPage
            experimentId={params.get("experiment")?.trim() ?? ""}
            sessionId={params.get("session")?.trim() ?? ""}
            draftName={params.get("name")?.trim() ?? ""}
          />
        )}
        {route === "projects" &&
          (projectView === "new" ? (
            <NewPersonalExperimentPage />
          ) : projectExperiment ? (
            <PersonalExperimentPage key={projectExperiment} experimentId={projectExperiment} />
          ) : (
            <ProjectsPage />
          ))}
        {route === "agent-workflow" && <AgentWorkflowPage />}
        {![
          "home",
          "discover",
          "experiments",
          "course",
          "analysis",
          "projects",
          "agent-workflow",
        ].includes(route) && <ModulePage module={current} />}
      </ErrorBoundary>
    </AppShell>
  );
}

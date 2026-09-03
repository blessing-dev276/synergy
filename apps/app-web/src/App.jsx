import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RoleGuard from "./components/RoleGuard.jsx";
import OnboardingGate from "./components/OnboardingGate.jsx";
import StatusGate from "./components/StatusGate.jsx";

import LandingPage from "./pages/marketing/LandingPage.jsx";
import LegalPage from "./pages/marketing/LegalPage.jsx";
import Login from "./pages/auth/Login.jsx";
import Signup from "./pages/auth/Signup.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import OnboardingFlow from "./pages/onboarding/OnboardingFlow.jsx";
import OrientationFlow from "./pages/onboarding/OrientationFlow.jsx";
import PendingApproval from "./pages/onboarding/PendingApproval.jsx";
import BlockedAccount from "./pages/BlockedAccount.jsx";

import MemberLayout from "./layouts/MemberLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";

import Dashboard from "./pages/member/Dashboard.jsx";
import PathList from "./pages/learning/PathList.jsx";
import PathDetail from "./pages/learning/PathDetail.jsx";
import CourseDetail from "./pages/learning/CourseDetail.jsx";
import LessonViewer from "./pages/learning/LessonViewer.jsx";
import QuizTaker from "./pages/learning/QuizTaker.jsx";
import MindTrainingPathDetail from "./pages/learning/MindTrainingPathDetail.jsx";
import MindTrainingLessonViewer from "./pages/learning/MindTrainingLessonViewer.jsx";
import MindTrainingActivityViewer from "./pages/learning/MindTrainingActivityViewer.jsx";
import MindTrainingAssessmentTaker from "./pages/learning/MindTrainingAssessmentTaker.jsx";
import PersonalDevelopmentResourceDetail from "./pages/learning/PersonalDevelopmentResourceDetail.jsx";
import AssignmentList from "./pages/assignments/AssignmentList.jsx";
import AssignmentDetail from "./pages/assignments/AssignmentDetail.jsx";
import TaskList from "./pages/tasks/TaskList.jsx";
import MyReports from "./pages/reports/MyReports.jsx";
import NotificationList from "./pages/notifications/NotificationList.jsx";
import Profile from "./pages/profile/Profile.jsx";
import NetworkDashboard from "./pages/network/NetworkDashboard.jsx";
import Goals from "./pages/goals/Goals.jsx";
import RankJourney from "./pages/rank-journey/RankJourney.jsx";
import Leaderboard from "./pages/leaderboard/Leaderboard.jsx";
import Wallet from "./pages/wallet/Wallet.jsx";
import Training from "./pages/training/Training.jsx";
import ClassPlayer from "./pages/training/ClassPlayer.jsx";

import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import ActivityLog from "./pages/admin/ActivityLog.jsx";
import ContentBuilder from "./pages/admin/content/ContentBuilder.jsx";
import CourseEditor from "./pages/admin/content/CourseEditor.jsx";
import RankBuilder from "./pages/admin/business-path/RankBuilder.jsx";
import MindTrainingManager from "./pages/admin/mind-training/MindTrainingManager.jsx";
import MindTrainingPathManager from "./pages/admin/mind-training/MindTrainingPathManager.jsx";
import PersonalDevelopmentManager from "./pages/admin/personal-development/PersonalDevelopmentManager.jsx";
import TrainingAdmin from "./pages/admin/training/TrainingAdmin.jsx";
import ClassEditor from "./pages/admin/training/ClassEditor.jsx";
import MemberDetail from "./pages/admin/members/MemberDetail.jsx";
import NetworkOverview from "./pages/admin/network/NetworkOverview.jsx";
import Submissions from "./pages/admin/submissions/Submissions.jsx";
import SettingsGeneral from "./pages/admin/settings/SettingsGeneral.jsx";
import SettingsNotifications from "./pages/admin/settings/SettingsNotifications.jsx";
import SettingsTeam from "./pages/admin/settings/SettingsTeam.jsx";

import Forbidden from "./pages/Forbidden.jsx";
import NotFound from "./pages/NotFound.jsx";

function App() {
  return (
    <Routes>
      {/* Public marketing root -- everything below (ProtectedRoute/
          RoleGuard/etc.) is completely unaffected; a signed-in visitor who
          navigates back to "/" just sees this page again, same as any
          other public route, since nothing here checks auth state. */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<LegalPage page="privacy" />} />
      <Route path="/terms" element={<LegalPage page="terms" />} />

      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<OnboardingGate />}>
          <Route path="/onboarding" element={<OnboardingFlow />} />

          <Route element={<StatusGate />}>
          <Route path="/orientation" element={<OrientationFlow />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route path="/blocked" element={<BlockedAccount />} />

          <Route element={<RoleGuard allow={["member"]} />}>
            <Route element={<MemberLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/learning" element={<PathList />} />
              {/* Mind Training and Personal Development are separate, fixed
                  path segments (not :pathId-shaped) -- react-router ranks a
                  static segment above a dynamic one at the same position
                  regardless of declaration order, so these never collide
                  with a skill_set/nm_business learning_paths id matched by
                  /learning/:pathId below. */}
              <Route path="/learning/mind-training" element={<PathList />} />
              <Route path="/learning/mind-training/:pathId" element={<MindTrainingPathDetail />} />
              <Route
                path="/learning/mind-training/:pathId/:levelId/:moduleId/lesson/:lessonId"
                element={<MindTrainingLessonViewer />}
              />
              <Route
                path="/learning/mind-training/:pathId/:levelId/:moduleId/activity/:activityId"
                element={<MindTrainingActivityViewer />}
              />
              <Route
                path="/learning/mind-training/:pathId/:levelId/:moduleId/assessment"
                element={<MindTrainingAssessmentTaker />}
              />
              <Route path="/learning/personal-development" element={<PathList />} />
              <Route path="/learning/personal-development/:resourceId" element={<PersonalDevelopmentResourceDetail />} />
              <Route path="/learning/:pathId" element={<PathDetail />} />
              <Route path="/learning/:pathId/:courseId" element={<CourseDetail />} />
              <Route
                path="/learning/:pathId/:courseId/:moduleId/:lessonId"
                element={<LessonViewer />}
              />
              <Route
                path="/learning/:pathId/:courseId/:moduleId/:lessonId/quiz"
                element={<QuizTaker />}
              />
              <Route path="/assignments" element={<AssignmentList />} />
              <Route path="/assignments/:assignmentId" element={<AssignmentDetail />} />
              <Route path="/tasks" element={<TaskList />} />
              <Route path="/reports" element={<MyReports />} />
              <Route path="/notifications" element={<NotificationList />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/network" element={<NetworkDashboard />} />
              {/* Prospects is now a section of My Network, not its own page --
                  this keeps any old bookmark/link working instead of 404ing. */}
              <Route path="/network/prospects" element={<Navigate to="/network" replace />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/rank-journey" element={<RankJourney />} />
              {/* Business Path merged into Rank Journey (0104) -- they turned out
                  to be the same six-step progression under two names. */}
              <Route path="/business-path" element={<Navigate to="/rank-journey" replace />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/training" element={<Training />} />
              <Route path="/training/classes/:classId" element={<ClassPlayer />} />
            </Route>
          </Route>

          <Route element={<RoleGuard allow={["admin"]} />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/business-path" element={<RankBuilder />} />
              <Route path="/admin/journey" element={<Navigate to="/admin/business-path" replace />} />
              <Route path="/admin/content" element={<ContentBuilder />} />
              <Route path="/admin/content/courses/:courseId" element={<CourseEditor />} />
              <Route path="/admin/mind-training" element={<MindTrainingManager />} />
              <Route path="/admin/mind-training/:pathId" element={<MindTrainingPathManager />} />
              <Route path="/admin/personal-development" element={<PersonalDevelopmentManager />} />
              <Route path="/admin/training" element={<TrainingAdmin />} />
              <Route path="/admin/training/classes/:classId" element={<ClassEditor />} />
              <Route path="/admin/members/:uid" element={<MemberDetail />} />
              <Route path="/admin/submissions" element={<Submissions />} />
              <Route path="/admin/leaderboard" element={<Leaderboard />} />
              <Route path="/admin/earnings" element={<Navigate to="/admin/leaderboard" replace />} />
              <Route path="/admin/network" element={<NetworkOverview />} />
              <Route path="/admin/notifications" element={<NotificationList />} />
              <Route path="/admin/settings/activity" element={<ActivityLog />} />
              <Route path="/admin/settings/general" element={<SettingsGeneral />} />
              <Route path="/admin/settings/notifications" element={<SettingsNotifications />} />
              <Route path="/admin/settings/team" element={<SettingsTeam />} />
            </Route>
          </Route>
          </Route>
        </Route>
      </Route>

      <Route path="/403" element={<Forbidden />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;

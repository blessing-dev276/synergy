import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RoleGuard from "./components/RoleGuard.jsx";
import OnboardingGate from "./components/OnboardingGate.jsx";

import Login from "./pages/auth/Login.jsx";
import Signup from "./pages/auth/Signup.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import OnboardingFlow from "./pages/onboarding/OnboardingFlow.jsx";

import MemberLayout from "./layouts/MemberLayout.jsx";
import MentorLayout from "./layouts/MentorLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";

import Dashboard from "./pages/member/Dashboard.jsx";
import PathList from "./pages/learning/PathList.jsx";
import PathDetail from "./pages/learning/PathDetail.jsx";
import CourseDetail from "./pages/learning/CourseDetail.jsx";
import LessonViewer from "./pages/learning/LessonViewer.jsx";
import QuizTaker from "./pages/learning/QuizTaker.jsx";
import AssignmentList from "./pages/assignments/AssignmentList.jsx";
import AssignmentDetail from "./pages/assignments/AssignmentDetail.jsx";
import TaskList from "./pages/tasks/TaskList.jsx";
import NotificationList from "./pages/notifications/NotificationList.jsx";
import Profile from "./pages/profile/Profile.jsx";

import MentorDashboard from "./pages/mentor/MentorDashboard.jsx";
import MemberProgress from "./pages/mentor/MemberProgress.jsx";
import ReviewQueue from "./pages/mentor/ReviewQueue.jsx";

import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import ContentBuilder from "./pages/admin/content/ContentBuilder.jsx";
import CourseEditor from "./pages/admin/content/CourseEditor.jsx";
import MemberList from "./pages/admin/members/MemberList.jsx";
import MemberDetail from "./pages/admin/members/MemberDetail.jsx";

import Forbidden from "./pages/Forbidden.jsx";
import NotFound from "./pages/NotFound.jsx";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<OnboardingGate />}>
          <Route path="/onboarding" element={<OnboardingFlow />} />

          <Route element={<RoleGuard allow={["member"]} />}>
            <Route element={<MemberLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/learning" element={<PathList />} />
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
              <Route path="/notifications" element={<NotificationList />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Route>

          <Route element={<RoleGuard allow={["mentor"]} />}>
            <Route element={<MentorLayout />}>
              <Route path="/mentor" element={<MentorDashboard />} />
              <Route path="/mentor/members/:memberUid" element={<MemberProgress />} />
              <Route path="/mentor/reviews" element={<ReviewQueue />} />
            </Route>
          </Route>

          <Route element={<RoleGuard allow={["admin"]} />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/content" element={<ContentBuilder />} />
              <Route path="/admin/content/courses/:courseId" element={<CourseEditor />} />
              <Route path="/admin/members" element={<MemberList />} />
              <Route path="/admin/members/:uid" element={<MemberDetail />} />
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

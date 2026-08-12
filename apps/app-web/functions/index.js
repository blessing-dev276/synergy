const { onUserCreate } = require("./auth");
const { setUserRole } = require("./roles");
const { assignMentor, unassignMentor } = require("./mentors");
const { markLessonComplete } = require("./lessons");
const { getQuizForAttempt, submitQuizAttempt } = require("./quizzes");
const { gradeAssignment } = require("./assignments");
const { deleteCourse } = require("./courses");
const { onLessonProgressWrite } = require("./triggers");

module.exports = {
  onUserCreate,
  setUserRole,
  assignMentor,
  unassignMentor,
  markLessonComplete,
  getQuizForAttempt,
  submitQuizAttempt,
  gradeAssignment,
  deleteCourse,
  onLessonProgressWrite,
};

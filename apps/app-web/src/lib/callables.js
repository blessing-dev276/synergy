import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase.js";

// One place for every server-authoritative action (see functions/index.js
// for the matching implementations and why each of these isn't a direct
// Firestore write).
export const markLessonComplete = httpsCallable(functions, "markLessonComplete");
export const getQuizForAttempt = httpsCallable(functions, "getQuizForAttempt");
export const submitQuizAttempt = httpsCallable(functions, "submitQuizAttempt");
export const gradeAssignment = httpsCallable(functions, "gradeAssignment");
export const assignMentor = httpsCallable(functions, "assignMentor");
export const unassignMentor = httpsCallable(functions, "unassignMentor");
export const setUserRole = httpsCallable(functions, "setUserRole");
export const deleteCourse = httpsCallable(functions, "deleteCourse");

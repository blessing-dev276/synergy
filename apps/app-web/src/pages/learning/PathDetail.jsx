import { Link, useParams } from "react-router-dom";
import { collection, doc, query, where, orderBy } from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../../firebase.js";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function PathDetail() {
  const { pathId } = useParams();

  const pathRef = useMemo(() => doc(db, "learningPaths", pathId), [pathId]);
  const { loading: loadingPath, data: path } = useLiveQuery(pathRef, [pathId]);

  const coursesQuery = useMemo(
    () =>
      query(
        collection(db, "courses"),
        where("pathId", "==", pathId),
        where("published", "==", true),
        orderBy("order", "asc"),
      ),
    [pathId],
  );
  const { loading: loadingCourses, error, data: courses } = useLiveQuery(coursesQuery, [pathId]);

  return (
    <div>
      {loadingPath && <Skeleton variant="text" width="240px" height="28px" />}
      {path && (
        <>
          <h1>{path.title}</h1>
          <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>{path.description}</p>
        </>
      )}

      {loadingCourses && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load courses." />}
      {!loadingCourses && !error && (!courses || courses.length === 0) && (
        <EmptyState icon="📘" title="No courses published in this path yet" />
      )}
      {courses && courses.length > 0 && (
        <div className="grid grid-2">
          {courses.map((course) => (
            <Link key={course.id} to={`/learning/${pathId}/${course.id}`} className="card">
              <div className="card-title">{course.title}</div>
              <div className="card-subtitle">{course.description}</div>
              <span className="badge badge-neutral">{course.lessonCount ?? 0} lessons</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

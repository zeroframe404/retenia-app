import { useEffect, useState } from 'react';
import { texts } from '../../preload/contract/texts';
import styles from './Progress.module.css';

export interface ActivityOption {
  readonly cardId: string;
  readonly question: string;
  readonly isExercise: boolean;
  readonly objectiveId: string;
  readonly objectiveTitle: string;
  readonly objectiveImplicit: boolean;
}

// Las actividades de un tema (o de las tarjetas sin tema), con su objetivo de ahora.
export function useActivities(subjectId: string, topicId: string | null): ActivityOption[] | null {
  const [activities, setActivities] = useState<ActivityOption[] | null>(null);
  useEffect(() => {
    let live = true;
    setActivities(null);
    window.retenia['objectives.activities']({ subjectId, topicId }).then(
      (loaded) => {
        if (live) {
          setActivities(loaded.activities);
        }
      },
      () => {
        if (live) {
          setActivities([]);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [subjectId, topicId]);
  return activities;
}

const currentOf = (activity: ActivityOption) =>
  activity.objectiveImplicit
    ? texts.progress.implicitTitle(activity.objectiveTitle || texts.progress.noTopic)
    : activity.objectiveTitle;

// La lista para elegir actividades: cada una con su marca «Ejercicio» y en qué objetivo está ahora.
export function ActivityChoices({
  legend,
  help,
  activities,
  chosen,
  onChange,
  exclude,
}: {
  legend: string;
  help: string;
  activities: readonly ActivityOption[] | null;
  chosen: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  // Un objetivo cuyas actividades no se ofrecen (ya son suyas).
  exclude?: string | undefined;
}) {
  const shown = (activities ?? []).filter((activity) => activity.objectiveId !== exclude);
  return (
    <fieldset className={styles.field}>
      <legend>{legend}</legend>
      <p className={styles.help}>{help}</p>
      {activities !== null && shown.length === 0 ? (
        <p className={styles.note}>{texts.progress.form.noActivities}</p>
      ) : (
        <ul className={styles.choices}>
          {shown.map((activity) => (
            <li key={activity.cardId}>
              <label className={styles.choice}>
                <input
                  type="checkbox"
                  checked={chosen.has(activity.cardId)}
                  onChange={() => {
                    const next = new Set(chosen);
                    if (!next.delete(activity.cardId)) {
                      next.add(activity.cardId);
                    }
                    onChange(next);
                  }}
                />
                <span>
                  {activity.question}
                  <small>
                    {activity.isExercise
                      ? `${texts.progress.form.exercise} · ${texts.progress.form.currently(currentOf(activity))}`
                      : texts.progress.form.currently(currentOf(activity))}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

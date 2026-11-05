import { useEffect, useState } from 'react';
import type { ReviewsList } from '../../preload/contract/study';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ItemList, ListItem, ScreenFrame, SectionTabs } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';
import styles from './Session.module.css';

// Progreso (Fase 10: por ahora, solo «Dudas y revisiones»): las dudas guardadas con la tarjeta de la
// que salieron y las tarjetas «En revisión». «Abrir la tarjeta» la abre en Apuntes › «Tarjetas».
export function ProgressScreen({
  focusTitle,
  onOpenCard,
  onGoToStudy,
}: {
  focusTitle: boolean;
  onOpenCard: (subjectId: string | null, cardId: string) => void;
  onGoToStudy: () => void;
}) {
  const [reviews, setReviews] = useState<ReviewsList | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` vuelve a leer después de «Reintentar».
  useEffect(() => {
    let live = true;
    setFailed(false);
    window.retenia['doubts.reviews']({}).then(
      (loaded) => {
        if (live) {
          setReviews(loaded);
        }
      },
      () => {
        if (live) {
          setFailed(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <ScreenFrame
      title={texts.nav.progress}
      focusTitle={focusTitle}
      actions={
        <Boton variant="primary" onClick={onGoToStudy}>
          {texts.progress.goToStudy}
        </Boton>
      }
    >
      <SectionTabs
        label={texts.progress.sectionsLabel}
        sections={[{ value: 'reviews', text: texts.progress.reviews }]}
        current="reviews"
        onChange={() => undefined}
      />
      <p className={styles.note}>{texts.progress.later}</p>
      {failed ? (
        <ViewState
          kind="error"
          phrase={texts.progress.loadFailed}
          action={{ text: texts.progress.retry, onClick: () => setAttempt((n) => n + 1) }}
        />
      ) : reviews === null ? (
        <ViewState kind="loading" phrase={texts.progress.loading} />
      ) : (
        <div className={styles.reviews}>
          <section aria-label={texts.progress.doubtsHeading}>
            <h3>{texts.progress.doubtsHeading}</h3>
            {reviews.doubts.length === 0 ? (
              <p className={styles.note}>{texts.progress.noDoubts}</p>
            ) : (
              <ItemList label={texts.progress.doubtsHeading}>
                {reviews.doubts.map((doubt) => (
                  <ListItem
                    key={doubt.id}
                    title={doubt.text}
                    text={
                      doubt.card
                        ? texts.progress.fromCard(doubt.card.question)
                        : texts.progress.general
                    }
                    detail={texts.progress.savedOn(formatShortDate(doubt.day))}
                    actions={
                      doubt.card ? (
                        <Boton
                          variant="quiet"
                          onClick={() =>
                            doubt.card && onOpenCard(doubt.card.subjectId, doubt.card.id)
                          }
                        >
                          {texts.progress.openCard}
                        </Boton>
                      ) : null
                    }
                  />
                ))}
              </ItemList>
            )}
          </section>
          <section aria-label={texts.progress.inReviewHeading}>
            <h3>{texts.progress.inReviewHeading}</h3>
            {reviews.inReview.length === 0 ? (
              <p className={styles.note}>{texts.progress.noInReview}</p>
            ) : (
              <ItemList label={texts.progress.inReviewHeading}>
                {reviews.inReview.map((card) => (
                  <ListItem
                    key={card.cardId}
                    title={card.question}
                    detail={card.subjectName ?? undefined}
                    actions={
                      <Boton
                        variant="quiet"
                        onClick={() => onOpenCard(card.subjectId, card.cardId)}
                      >
                        {texts.progress.openCard}
                      </Boton>
                    }
                  />
                ))}
              </ItemList>
            )}
          </section>
        </div>
      )}
    </ScreenFrame>
  );
}

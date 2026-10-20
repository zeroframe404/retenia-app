import { Lightbulb } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { demoTexts } from '../../../preload/contract/demo-texts';
import { texts } from '../../../preload/contract/texts';
import { Boton } from '../../ui/Boton';
import {
  AvisoEvaluacionCorregida,
  Resultado,
  UnidadesDeIdea,
  type Verdict,
} from '../../ui/Evaluation';
import { Dialog, ItemList, ListItem, ScreenFrame, SidePanel, Toast } from '../../ui/Frame';
import { EtiquetaEjemplo, IndicadorBorrador, RotuloDato, RotuloModo } from '../../ui/Labels';
import { EstadoDominio, type Mastery, PropuestaItem } from '../../ui/Mastery';
import { BannerEstado, EtapasProcesamiento } from '../../ui/Process';
import {
  BarraAyuda,
  CierreSesion,
  CompromisoSemanal,
  ConfianzaDeclarada,
  type Confidence,
  PropuestaSesion,
  type Rating,
  ValoracionSesion,
} from '../../ui/Session';
import { ViewState, type ViewStateKind } from '../../ui/ViewStates';
import styles from './gallery.module.css';

const g = demoTexts.gallery;

// Un componente con su nombre y, adentro, cada variante con el suyo. Es un artículo y no una región:
// algunos componentes llevan adentro su propia región con el mismo nombre.
function Component({ name, children }: { name: string; children: ReactNode }) {
  const id = useId();
  return (
    <article className={styles.component} aria-labelledby={id}>
      <h3 id={id} className={styles.name}>
        {name}
      </h3>
      <div className={styles.variants}>{children}</div>
    </article>
  );
}

function Variant({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className={styles.variant}>
      <figcaption className={styles.caption}>{g.variant(name)}</figcaption>
      {children}
    </figure>
  );
}

const MASTERY: { state: Mastery; toVerify?: boolean }[] = [
  { state: 'not-started' },
  { state: 'in-practice' },
  { state: 'to-review' },
  { state: 'enough' },
  { state: 'consolidated' },
  { state: 'enough', toVerify: true },
];

const VERDICTS: { verdict: Verdict; text: string; provisional?: boolean }[] = [
  { verdict: 'correct', text: texts.ui.verdicts.correct },
  { verdict: 'on-track', text: texts.ui.verdicts.onTrack },
  { verdict: 'not-yet', text: texts.ui.verdicts.notYet },
  { verdict: 'not-yet', text: texts.ui.verdicts.notYet, provisional: true },
  { verdict: 'unsure', text: texts.ui.verdicts.unsure },
];

const STATES: { kind: ViewStateKind; name: string; phrase: string; action: string }[] = [
  { kind: 'empty', name: g.states.empty, phrase: g.sample.empty, action: g.sample.emptyAction },
  {
    kind: 'loading',
    name: g.states.loading,
    phrase: g.sample.loading,
    action: g.sample.loadingAction,
  },
  { kind: 'error', name: g.states.error, phrase: g.sample.error, action: g.sample.errorAction },
  {
    kind: 'success',
    name: g.states.success,
    phrase: g.sample.success,
    action: g.sample.successAction,
  },
  {
    kind: 'no-permission',
    name: g.states.noPermission,
    phrase: g.sample.noPermission,
    action: g.sample.noPermissionAction,
  },
  {
    kind: 'offline',
    name: g.states.offline,
    phrase: g.sample.offline,
    action: g.sample.offlineAction,
  },
];

// Ajustes › «Demostración» › «Galería» (H-08, solo en «Retenia (prueba)»): todos los componentes
// con sus variantes, el armazón y los seis estados de una vista. Lo que muestra es de ejemplo y
// no hace nada; lo único que responde son las opciones de confianza y de valoración, el panel y
// el diálogo.
export function GalleryScreen({
  onBack,
  focusTitle,
}: {
  onBack: () => void;
  focusTitle?: boolean;
}) {
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [closingRating, setClosingRating] = useState<Rating | null>(null);
  const [dialog, setDialog] = useState(false);
  const [sidePanel, setSidePanel] = useState(true);
  const nothing = () => undefined;

  return (
    <ScreenFrame
      title={g.title}
      focusTitle={focusTitle ?? false}
      actions={<Boton onClick={onBack}>{g.back}</Boton>}
    >
      <p className={styles.intro}>{g.intro}</p>

      <section className={styles.region} aria-label={g.componentsRegion}>
        <Component name={g.names.button}>
          <Variant name={g.variants.primary}>
            <Boton variant="primary" onClick={nothing}>
              {texts.ui.proposal.start}
            </Boton>
          </Variant>
          <Variant name={g.variants.secondary}>
            <Boton onClick={nothing}>{texts.ui.proposal.shortVersion}</Boton>
          </Variant>
          <Variant name={g.variants.quiet}>
            <Boton variant="quiet" onClick={nothing}>
              {texts.ui.closing.adjustPlan}
            </Boton>
          </Variant>
          <Variant name={g.variants.withIcon}>
            <Boton icon={Lightbulb} onClick={nothing}>
              {texts.ui.helpBar.hint}
            </Boton>
          </Variant>
          <Variant name={g.variants.disabled}>
            <Boton disabled>{texts.ui.closing.finish}</Boton>
          </Variant>
        </Component>

        <Component name={g.names.modeLabel}>
          <RotuloModo mode="help" />
          <RotuloModo mode="autonomous" />
          <RotuloModo mode="evaluation" />
        </Component>

        <Component name={g.names.dataLabel}>
          <Variant name={g.variants.observed}>
            <RotuloDato kind="observed" count={84} />
          </Variant>
          <Variant name={g.variants.estimated}>
            <RotuloDato kind="estimated" count={30} />
          </Variant>
          <Variant name={g.variants.insufficient}>
            <RotuloDato kind="insufficient" count={6} />
          </Variant>
        </Component>

        <Component name={g.names.exampleTag}>
          <EtiquetaEjemplo />
        </Component>

        <Component name={g.names.draft}>
          <Variant name={g.variants.saving}>
            <IndicadorBorrador state="saving" />
          </Variant>
          <Variant name={g.variants.draftSaved}>
            <IndicadorBorrador state="draft" />
          </Variant>
          <Variant name={g.variants.saved}>
            <IndicadorBorrador state="saved" />
          </Variant>
        </Component>

        <Component name={g.names.sessionProposal}>
          <PropuestaSesion minutes={25} reason={g.sample.reason} headingLevel={4} />
        </Component>

        <Component name={g.names.commitment}>
          <Variant name={g.variants.done}>
            <CompromisoSemanal done={2} goal={3} />
          </Variant>
          <Variant name={g.variants.none}>
            <CompromisoSemanal done={0} goal={3} />
          </Variant>
        </Component>

        <Component name={g.names.helpBar}>
          <Variant name={g.variants.hintReady}>
            <BarraAyuda />
          </Variant>
          <Variant name={g.variants.hintDisabled}>
            <BarraAyuda hintDisabled />
          </Variant>
        </Component>

        <Component name={g.names.confidence}>
          <ConfianzaDeclarada value={confidence} onChange={setConfidence} />
        </Component>

        <Component name={g.names.ideaUnits}>
          <UnidadesDeIdea
            headingLevel={4}
            hideHeading
            units={[
              { text: g.sample.ideaOne, status: 'covered', quote: g.sample.ideaOneQuote },
              { text: g.sample.ideaTwo, status: 'partial', quote: g.sample.ideaTwoQuote },
              { text: g.sample.ideaThree, status: 'missing' },
            ]}
          />
        </Component>

        <Component name={g.names.result}>
          {VERDICTS.map(({ verdict, text, provisional }) => (
            <Variant
              key={`${verdict}-${provisional ? 'provisional' : 'firm'}`}
              name={provisional ? `${text} ${g.variants.provisional}` : text}
            >
              <Resultado
                verdict={verdict}
                review={g.sample.review}
                provisional={provisional ?? false}
                action={
                  <Boton onClick={nothing}>
                    {verdict === 'correct' ? g.sample.next : texts.cards.retry}
                  </Boton>
                }
              />
            </Variant>
          ))}
        </Component>

        <Component name={g.names.correctedNotice}>
          <AvisoEvaluacionCorregida
            before={g.sample.correctedBefore}
            after={g.sample.correctedAfter}
            effect={g.sample.correctedEffect}
          />
        </Component>

        <Component name={g.names.rating}>
          <ValoracionSesion value={rating} onChange={setRating} />
        </Component>

        <Component name={g.names.closing}>
          <CierreSesion
            headingLevel={4}
            minutes={13}
            results={[
              { label: texts.cards.gradeGood, count: 8 },
              { label: texts.cards.gradeHard, count: 3 },
              { label: texts.cards.gradeAgain, count: 2 },
            ]}
            difficulties={[g.sample.difficultyOne, g.sample.difficultyTwo]}
            nextStep={g.sample.nextStep}
            rating={closingRating}
            onRate={setClosingRating}
          />
        </Component>

        <Component name={g.names.mastery}>
          {MASTERY.map(({ state, toVerify }) => (
            <EstadoDominio
              key={`${state}-${toVerify ? 'to-verify' : 'firm'}`}
              state={state}
              toVerify={toVerify ?? false}
            />
          ))}
        </Component>

        <Component name={g.names.proposalItem}>
          <PropuestaItem
            text={g.sample.proposalText}
            goal={g.sample.proposalGoal}
            quote={g.sample.proposalQuote}
          />
        </Component>

        <Component name={g.names.stages}>
          <EtapasProcesamiento
            stages={[
              { text: texts.ui.stages.saved, status: 'done' },
              { text: texts.ui.stages.extracted(11, 12), status: 'current' },
              { text: texts.ui.stages.sections, status: 'pending' },
              { text: texts.ui.stages.ready, status: 'pending' },
            ]}
          />
        </Component>

        <Component name={g.names.banner}>
          <Variant name={g.variants.info}>
            <BannerEstado tone="info">{g.sample.bannerInfo}</BannerEstado>
          </Variant>
          <Variant name={g.variants.pending}>
            <BannerEstado tone="pending">{g.sample.bannerPending}</BannerEstado>
          </Variant>
          <Variant name={g.variants.attention}>
            <BannerEstado
              tone="attention"
              action={<Boton onClick={nothing}>{g.sample.bannerAction}</Boton>}
            >
              {g.sample.bannerAttention}
            </BannerEstado>
          </Variant>
        </Component>
      </section>

      <section className={styles.region} aria-label={g.frameRegion}>
        <Component name={g.frame.notice}>
          <Variant name={g.variants.info}>
            <Toast>{g.frame.noticeInfo}</Toast>
          </Variant>
          <Variant name={g.variants.success}>
            <Toast tone="success">{g.frame.noticeSuccess}</Toast>
          </Variant>
          <Variant name={g.variants.attention}>
            <Toast tone="attention">{g.frame.noticeAttention}</Toast>
          </Variant>
        </Component>

        <Component name={g.frame.list}>
          <ItemList label={g.frame.listLabel}>
            <ListItem
              title={g.frame.listFirst}
              detail={g.frame.listFirstDetail}
              actions={<Boton onClick={nothing}>{texts.cards.review}</Boton>}
            />
            <ListItem
              title={g.frame.listSecond}
              detail={g.frame.listSecondDetail}
              actions={<Boton onClick={nothing}>{texts.cards.review}</Boton>}
            />
          </ItemList>
        </Component>

        <Component name={g.frame.sidePanel}>
          {sidePanel ? (
            <SidePanel title={g.frame.sidePanelTitle} onClose={() => setSidePanel(false)}>
              <p className={styles.intro}>{g.frame.sidePanelBody}</p>
            </SidePanel>
          ) : (
            <Boton onClick={() => setSidePanel(true)}>{g.frame.sidePanelTitle}</Boton>
          )}
        </Component>

        <Component name={g.frame.dialog}>
          <Boton onClick={() => setDialog(true)}>{g.frame.openDialog}</Boton>
          {dialog ? (
            <Dialog title={g.frame.dialogTitle} onClose={() => setDialog(false)}>
              <p className={styles.intro}>{g.frame.dialogBody}</p>
            </Dialog>
          ) : null}
        </Component>
      </section>

      <section className={styles.region} aria-label={g.statesRegion}>
        <div className={styles.states}>
          {STATES.map(({ kind, name, phrase, action }) => (
            <Variant key={kind} name={name}>
              <ViewState kind={kind} phrase={phrase} action={{ text: action, onClick: nothing }} />
            </Variant>
          ))}
        </div>
      </section>
    </ScreenFrame>
  );
}

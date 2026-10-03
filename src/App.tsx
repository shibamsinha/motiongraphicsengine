import React, { useState } from 'react';
import type { Project, ProjectOrigin } from './types/project';
import { loadProject } from './utils/persistence';
import { Splash } from './components/start/Splash';
import { StartScreen } from './components/start/StartScreen';
import { Editor } from './Editor';

const restored = loadProject();

type Phase =
  | { kind: 'splash' }
  | { kind: 'start' }
  | { kind: 'editor'; project: Project; origin: ProjectOrigin };

export const App: React.FC = () => {
  const [phase, setPhase] = useState<Phase>({ kind: 'splash' });

  if (phase.kind === 'splash') {
    return <Splash onDone={() => setPhase({ kind: 'start' })} />;
  }

  if (phase.kind === 'start') {
    return (
      <StartScreen
        resumable={restored}
        onOpen={(project, origin) => setPhase({ kind: 'editor', project, origin })}
      />
    );
  }

  return <Editor key={phase.origin} initial={phase.project} />;
};

import React from 'react';

export default function CanvasHelp() {
  return (
    <details className="canvas-help">
      <summary aria-label="Open canvas guide" title="Canvas guide">?</summary>
      <div className="canvas-help-popover">
        <strong>Canvas guide</strong>
        <ul>
          <li><b>Move squad:</b> drag the top bar of a node.</li>
          <li><b>Move canvas:</b> drag an empty area of the canvas.</li>
          <li><b>Command line:</b> connect the bottom of the parent to the top of the child.</li>
          <li><b>Support:</b> the left node provides support and the right node receives it. Click order does not matter.</li>
          <li><b>Remove connection:</b> use the red × next to the relevant connector.</li>
        </ul>
        <strong>Canvas buttons</strong>
        <ul>
          <li><b>+ Squad:</b> adds a new squad to the canvas.</li>
          <li><b>Clear:</b> removes all command and support lines without deleting squads.</li>
          <li><b>Reset:</b> returns all squads to their default positions.</li>
          <li><b>Auto-layout:</b> automatically arranges all squads and keeps their current connections.</li>
          <li><b>Connector dots:</b> select two dots to create a command or support line.</li>
          <li><b>Red ×:</b> removes the lines attached to that connector.</li>
        </ul>
        <small>Save your changes afterwards using Save.</small>
      </div>
    </details>
  );
}

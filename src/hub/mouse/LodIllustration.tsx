// Original ATK hub "atk-mouse-locd": the mouse side icon sits `lod` mm above a dotted desk line, with a ruler
// between them. RATE px per mm matches the original (--rate: 15).
const RATE = 15;
// Original v3-mouse-mouse-locd icon (72x26).
const MOUSE =
  "M40.02.051c10.57-.49 22.318 2 29.422 10.403 3.715 3.932 3.183 9.605-.968 13.41-2.183 1.587-4.318 1.938-7.344 1.938a6501 6501 0 0 1-51.501 0c-4.089-.599-8.313-3.273-9.535-7.393q-.464-2.38 1.377-3.926a90 90 0 0 1 7.852-5.457q.625-2.586 2.856-4.028c2.054-1.45 4.921-2.122 7.292-1.07C25.882 1.184 33.131.516 40.02.05m4.487 10.046a72.2 72.2 0 0 0-19.989 2.14A708 708 0 0 0 1.674 18.46c1.466 3.047 3.984 4.927 7.14 5.66 9.176-.034 39.397-.09 52.49-.1 2.257-.002 4.676-.106 6.352-1.619 1.786-1.61 2.795-4.06 2.857-6.541-8.952 0-17.077-5.106-26.006-5.762M25.54 3.519q-1.468.406-2.958.866a77.8 77.8 0 0 0-19.479 10.81 6.8 6.8 0 0 0-1.53 1.582l.102.101a574 574 0 0 1 23.457-6.424q.56-3.45.816-6.935zm32.023.56a46.8 46.8 0 0 0-18.97-2.345q-5.55.366-11.015 1.376-.397 3.47-.816 6.935c10.084-1.778 18.34-2.728 28.351.56q4.017 1.357 8.057 2.653c2.251.582 4.201 1.127 6.773 1.127C67.37 9.243 63.026 6.121 57.562 4.08m-40.488.766q-3.417.408-5.712 3.008a232 232 0 0 1 5.814-2.856q.185-.169-.102-.152";

export function LodIllustration({ lod }: { lod: number }) {
  const ruler = Math.max(0, lod) * RATE;
  return (
    <div className="hm-lod-art" aria-hidden="true">
      <div className="mouse" style={{ bottom: `${20 + ruler}px` }}>
        <svg width="72" height="26" viewBox="0 0 72 26" fill="none">
          <path d={MOUSE} fill="currentColor" />
        </svg>
      </div>
      <div className="ruler" style={{ height: `${Math.max(0, ruler - 2)}px` }} />
      <div className="line" />
    </div>
  );
}

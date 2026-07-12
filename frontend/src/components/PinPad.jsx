/** Borderless numeric keypad with PIN dot indicators (Figma "Authorize Payment" style). */
export default function PinPad({ value, onChange, length = 4, boxed = false }) {
  const press = (d) => {
    if (value.length < length) onChange(value + d);
  };
  const back = () => onChange(value.slice(0, -1));

  return (
    <div>
      <div className="mb-8 flex items-center justify-center gap-4">
        {Array.from({ length }).map((_, i) =>
          boxed ? (
            <div
              key={i}
              className={`flex h-14 w-11 items-center justify-center rounded-xl transition ${
                i < value.length ? 'bg-lav' : 'bg-lav-faint'
              }`}
            >
              {i < value.length && <div className="h-2.5 w-2.5 rounded-full bg-navy" />}
            </div>
          ) : (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition ${
                i < value.length ? 'bg-navy' : 'bg-lav'
              }`}
            />
          )
        )}
      </div>
      <div className="grid grid-cols-3 gap-y-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <div />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={back} aria-label="Delete">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 5h9a2 2 0 012 2v10a2 2 0 01-2 2H9l-6-7 6-7z" strokeLinejoin="round" />
            <path d="M12 10l4 4M16 10l-4 4" strokeLinecap="round" />
          </svg>
        </Key>
      </div>
    </div>
  );
}

function Key({ children, ...props }) {
  return (
    <button
      type="button"
      className="mx-auto flex h-14 w-20 items-center justify-center rounded-2xl text-2xl font-semibold text-navy-ink transition active:bg-lav"
      {...props}
    >
      {children}
    </button>
  );
}

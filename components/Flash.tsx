/** The ?notice= and ?error= a form action redirected back with. */
export function Flash({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {notice && (
        <p role="status" className="flash">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="flash flash-error">
          {error}
        </p>
      )}
    </>
  );
}

export default function TestPage() {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "red",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      color: "white",
      fontSize: "24px",
      fontWeight: "bold"
    }}>
      <h1>TEST PAGINA ADMIN</h1>
      <p>Se vedi questo, la pagina funziona!</p>
      <p style={{ fontSize: "16px", marginTop: "20px" }}>
        Larghezza schermo: <span id="width"></span>
      </p>
      <script dangerouslySetInnerHTML={{
        __html: `document.getElementById('width').textContent = window.innerWidth + 'px';`
      }} />
    </div>
  );
}

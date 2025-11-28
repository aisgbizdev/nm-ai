export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        padding: "24px",
      }}
    >
      <img
        src="/assets/Loading_Nm.gif"
        alt="Loading NM"
        style={{ maxWidth: "240px", width: "40vw", height: "auto" }}
      />
    </div>
  );
}

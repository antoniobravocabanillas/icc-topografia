import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f3f3"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            transform: "translateY(-1px)"
          }}
        >
          <span style={{ width: 30, height: 7, background: "#0e1a26" }} />
          <span style={{ width: 22, height: 7, background: "#25c0d5" }} />
          <span style={{ width: 14, height: 7, background: "#4374ba" }} />
        </div>
      </div>
    ),
    size
  );
}

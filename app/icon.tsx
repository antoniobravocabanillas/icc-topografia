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
          background: "#0f172a"
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
          <span style={{ width: 30, height: 7, background: "#f3f4f6" }} />
          <span style={{ width: 22, height: 7, background: "#06b6d4" }} />
          <span style={{ width: 14, height: 7, background: "#2563eb" }} />
        </div>
      </div>
    ),
    size
  );
}

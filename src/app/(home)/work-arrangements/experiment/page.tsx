import WorkArrangementManager from "@/components/features/work-arrangement/WorkArrangementManager";

// Bản gốc (kéo-thả) tạm ẩn khỏi menu — vẫn truy cập trực tiếp qua URL này khi cần đối chiếu.
export default function WorkArrangementsExperimentRoute() {
  return <WorkArrangementManager initialTab="assignment" />;
}

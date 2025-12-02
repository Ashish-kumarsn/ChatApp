export default function formatTimestamp(timestamp) {
  if (!timestamp) return "";          // 🔥 guard 1

  const messageTime = new Date(timestamp);
  if (isNaN(messageTime)) return "";  // 🔥 guard 2

  const now = Date.now();
  const diff = now - messageTime.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  return `${Math.floor(diff / 86400000)} days ago`;
}

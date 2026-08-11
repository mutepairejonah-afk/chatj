import { createFileRoute } from "@tanstack/react-router";
import { ChatListPanel } from "@/components/ChatListPanel";

export const Route = createFileRoute("/")({
  component: ChatsPage,
  head: () => ({
    meta: [
      { title: "Chats — ChatApp" },
      { name: "description", content: "Your conversations" },
    ],
  }),
});

function ChatsPage() {
  return <ChatListPanel />;
}

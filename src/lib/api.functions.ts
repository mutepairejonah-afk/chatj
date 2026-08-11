import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

// All functions require clerkUserId as input since TanStack Start
// server functions are called as RPCs, not HTTP requests

// ═══════════════════════════════════════════
// PROFILE FUNCTIONS
// ═══════════════════════════════════════════

export const getOrCreateProfile = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      displayName: z.string().min(1).max(255).optional(),
      avatarUrl: z.string().url().max(2048).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", data.clerkUserId)
      .single();

    if (existing) return existing;

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .insert({
        clerk_user_id: data.clerkUserId,
        display_name: data.displayName || null,
        avatar_url: data.avatarUrl || null,
        is_online: true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create profile: ${error.message}`);
    return profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      displayName: z.string().min(1).max(255).optional(),
      avatarUrl: z.string().url().max(2048).optional(),
      statusMessage: z.string().max(500).optional(),
      isOnline: z.boolean().optional(),
    })
  )
  .handler(async ({ data }) => {
    const updates: {
      display_name?: string;
      avatar_url?: string;
      status_message?: string;
      is_online?: boolean;
      last_seen?: string;
    } = {};
    if (data.displayName !== undefined) updates.display_name = data.displayName;
    if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl;
    if (data.statusMessage !== undefined) updates.status_message = data.statusMessage;
    if (data.isOnline !== undefined) {
      updates.is_online = data.isOnline;
      if (!data.isOnline) updates.last_seen = new Date().toISOString();
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("clerk_user_id", data.clerkUserId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update profile: ${error.message}`);
    return profile;
  });

// ═══════════════════════════════════════════
// CONTACTS FUNCTIONS
// ═══════════════════════════════════════════

export const getContacts = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rawContacts } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("user_clerk_id", data.clerkUserId)
      .eq("status", "accepted");

    if (!rawContacts?.length) return [];

    const clerkIds = rawContacts.map((c) => c.contact_clerk_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("clerk_user_id", clerkIds);

    return rawContacts.map((c) => ({
      ...c,
      profile: profiles?.find((p) => p.clerk_user_id === c.contact_clerk_id) || null,
    }));
  });

// Send a friend request (creates pending_outgoing for me + pending_incoming for them).
// If a row already exists in any state, returns its current status so the UI can react.
export const addContact = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      contactClerkId: z.string().min(1).max(255),
      nickname: z.string().min(1).max(255).optional(),
    })
  )
  .handler(async ({ data }) => {
    if (data.clerkUserId === data.contactClerkId) {
      throw new Error("You cannot add yourself as a contact");
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id")
      .eq("clerk_user_id", data.contactClerkId)
      .single();
    if (!targetProfile) throw new Error("User not found");

    // Check existing relationship (in either direction)
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("status")
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.contactClerkId)
      .maybeSingle();

    if (existing?.status === "accepted") {
      return { status: "accepted" as const };
    }
    if (existing?.status === "pending_outgoing") {
      return { status: "pending_outgoing" as const };
    }
    // If they already sent ME a request (pending_incoming on my side), accepting auto-mutual
    if (existing?.status === "pending_incoming") {
      await supabaseAdmin
        .from("contacts")
        .update({ status: "accepted" })
        .eq("user_clerk_id", data.clerkUserId)
        .eq("contact_clerk_id", data.contactClerkId);
      await supabaseAdmin
        .from("contacts")
        .update({ status: "accepted" })
        .eq("user_clerk_id", data.contactClerkId)
        .eq("contact_clerk_id", data.clerkUserId);
      return { status: "accepted" as const };
    }

    // Fresh request — write both sides
    const { error: e1 } = await supabaseAdmin.from("contacts").upsert(
      {
        user_clerk_id: data.clerkUserId,
        contact_clerk_id: data.contactClerkId,
        nickname: data.nickname || null,
        status: "pending_outgoing",
      },
      { onConflict: "user_clerk_id,contact_clerk_id" }
    );
    if (e1) throw new Error(`Failed to send request: ${e1.message}`);

    const { error: e2 } = await supabaseAdmin.from("contacts").upsert(
      {
        user_clerk_id: data.contactClerkId,
        contact_clerk_id: data.clerkUserId,
        status: "pending_incoming",
      },
      { onConflict: "user_clerk_id,contact_clerk_id" }
    );
    if (e2) throw new Error(`Failed to deliver request: ${e2.message}`);

    return { status: "pending_outgoing" as const };
  });

// Remove ANY relationship (accepted or pending) — wipes both sides
export const removeContact = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      contactClerkId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.contactClerkId);
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_clerk_id", data.contactClerkId)
      .eq("contact_clerk_id", data.clerkUserId);
    return { success: true };
  });

// Returns relationship status from MY perspective: 'none' | 'accepted' | 'pending_outgoing' | 'pending_incoming'
export const isContact = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      contactClerkId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("contacts")
      .select("status")
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.contactClerkId)
      .maybeSingle();
    return {
      isContact: row?.status === "accepted",
      status: (row?.status || "none") as "none" | "accepted" | "pending_outgoing" | "pending_incoming",
    };
  });

// Pending incoming friend requests for me, with requester profiles
export const getPendingRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("user_clerk_id", data.clerkUserId)
      .eq("status", "pending_incoming")
      .order("created_at", { ascending: false });

    if (!rows?.length) return [];

    const ids = rows.map((r) => r.contact_clerk_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("clerk_user_id", ids);

    return rows.map((r) => ({
      ...r,
      profile: profiles?.find((p) => p.clerk_user_id === r.contact_clerk_id) || null,
    }));
  });

// Pending requests I sent that haven't been accepted yet
export const getOutgoingRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("user_clerk_id", data.clerkUserId)
      .eq("status", "pending_outgoing")
      .order("created_at", { ascending: false });

    if (!rows?.length) return [];

    const ids = rows.map((r) => r.contact_clerk_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("clerk_user_id", ids);

    return rows.map((r) => ({
      ...r,
      profile: profiles?.find((p) => p.clerk_user_id === r.contact_clerk_id) || null,
    }));
  });

export const acceptContactRequest = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      requesterClerkId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    // Confirm the incoming request actually exists for me
    const { data: incoming } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.requesterClerkId)
      .eq("status", "pending_incoming")
      .maybeSingle();
    if (!incoming) throw new Error("No pending request from this user");

    await supabaseAdmin
      .from("contacts")
      .update({ status: "accepted" })
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.requesterClerkId);

    await supabaseAdmin
      .from("contacts")
      .update({ status: "accepted" })
      .eq("user_clerk_id", data.requesterClerkId)
      .eq("contact_clerk_id", data.clerkUserId);

    return { success: true };
  });

export const rejectContactRequest = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      requesterClerkId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    // Delete both sides so the requester can ask again later
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.requesterClerkId);
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_clerk_id", data.requesterClerkId)
      .eq("contact_clerk_id", data.clerkUserId);
    return { success: true };
  });

// Single number for the in-app bell badge: pending requests + total unread chat messages
export const getNotificationCount = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { count: requestCount } = await supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_clerk_id", data.clerkUserId)
      .eq("status", "pending_incoming");

    const { data: memberships } = await supabaseAdmin
      .from("conversation_members")
      .select("unread_count")
      .eq("clerk_user_id", data.clerkUserId);

    const unreadMessages = (memberships || []).reduce(
      (sum, m) => sum + (m.unread_count || 0),
      0
    );

    return {
      pendingRequests: requestCount || 0,
      unreadMessages,
      total: (requestCount || 0) + unreadMessages,
    };
  });

// ═══════════════════════════════════════════
// CONVERSATIONS & MESSAGES FUNCTIONS
// ═══════════════════════════════════════════

export const getConversations = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: memberships, error } = await supabaseAdmin
      .from("conversation_members")
      .select("conversation_id, is_pinned, unread_count, mute_until")
      .eq("clerk_user_id", data.clerkUserId);

    if (error || !memberships?.length) return [];

    const convIds = memberships.map((m) => m.conversation_id);

    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .in("id", convIds)
      .order("updated_at", { ascending: false });

    if (!conversations) return [];

    const { data: allMembers } = await supabaseAdmin
      .from("conversation_members")
      .select("conversation_id, clerk_user_id")
      .in("conversation_id", convIds);

    const otherClerkIds = [...new Set(
      allMembers?.filter((m) => m.clerk_user_id !== data.clerkUserId).map((m) => m.clerk_user_id) || []
    )];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("clerk_user_id", otherClerkIds.length ? otherClerkIds : ["__none__"]);

    const results = await Promise.all(
      conversations.map(async (conv) => {
        const { data: lastMsg } = await supabaseAdmin
          .from("messages")
          .select("*")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const membership = memberships.find((m) => m.conversation_id === conv.id);
        const memberClerkIds = allMembers
          ?.filter((m) => m.conversation_id === conv.id && m.clerk_user_id !== data.clerkUserId)
          .map((m) => m.clerk_user_id) || [];
        const memberProfiles = profiles?.filter((p) => memberClerkIds.includes(p.clerk_user_id)) || [];

        const muted = membership?.mute_until && new Date(membership.mute_until).getTime() > Date.now();
        return {
          ...conv,
          isPinned: membership?.is_pinned || false,
          unreadCount: membership?.unread_count || 0,
          isMuted: !!muted,
          muteUntil: membership?.mute_until || null,
          lastMessage: lastMsg,
          contact: memberProfiles[0] || null,
          memberProfiles,
          memberCount: (allMembers?.filter((m) => m.conversation_id === conv.id) || []).length,
        };
      })
    );

    return results;
  });

export const getMessages = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
      limit: z.number().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data }) => {
    // Sweep expired messages first (best-effort, no error if it fails)
    try {
      await supabaseAdmin
        .from("messages")
        .delete()
        .eq("conversation_id", data.conversationId)
        .lt("expires_at", new Date().toISOString());
    } catch (err) {
      console.error("Expired-message sweep failed:", err);
    }

    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("*, reactions:message_reactions(*)")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(data.limit || 100);

    if (error) throw new Error(`Failed to get messages: ${error.message}`);
    if (!messages?.length) return [];

    // My star set
    const msgIds = messages.map((m: any) => m.id);
    const { data: stars } = await supabaseAdmin
      .from("starred_messages")
      .select("message_id")
      .eq("clerk_user_id", data.clerkUserId)
      .in("message_id", msgIds);
    const starSet = new Set((stars || []).map((s: any) => s.message_id));

    return messages.map((m: any) => ({ ...m, starred_by_me: starSet.has(m.id) }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
      text: z.string().min(1).max(5000).optional(),
      imageUrl: z.string().url().max(2048).optional(),
      replyToMessageId: z.string().uuid().optional(),
    })
  )
  .handler(async ({ data }) => {
    // Permission: only_admins_send for groups
    const { data: convPerm } = await supabaseAdmin
      .from("conversations")
      .select("type, only_admins_send, disappearing_seconds")
      .eq("id", data.conversationId)
      .single();
    if (convPerm?.type === "group" && convPerm.only_admins_send) {
      const { data: m } = await supabaseAdmin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", data.conversationId)
        .eq("clerk_user_id", data.clerkUserId)
        .maybeSingle();
      if (!m || m.role !== "admin") {
        throw new Error("Only admins can send messages in this group");
      }
    }
    // Disappearing TTL
    const expiresAt = convPerm?.disappearing_seconds
      ? new Date(Date.now() + convPerm.disappearing_seconds * 1000).toISOString()
      : null;

    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_clerk_id: data.clerkUserId,
        text: data.text || null,
        image_url: data.imageUrl || null,
        reply_to_message_id: data.replyToMessageId || null,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to send message: ${error.message}`);

    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    // Increment unread for other members
    const { data: members } = await supabaseAdmin
      .from("conversation_members")
      .select("id, unread_count")
      .eq("conversation_id", data.conversationId)
      .neq("clerk_user_id", data.clerkUserId);

    if (members?.length) {
      for (const m of members) {
        await supabaseAdmin
          .from("conversation_members")
          .update({ unread_count: (m.unread_count || 0) + 1 })
          .eq("id", m.id);
      }
    }

    return message;
  });

export const editMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      messageId: z.string().uuid(),
      newText: z.string().min(1).max(5000),
    })
  )
  .handler(async ({ data }) => {
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("sender_clerk_id")
      .eq("id", data.messageId)
      .single();

    if (!msg) throw new Error("Message not found");
    if (msg.sender_clerk_id !== data.clerkUserId) throw new Error("You can only edit your own messages");

    const { data: updated, error } = await supabaseAdmin
      .from("messages")
      .update({
        text: data.newText,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq("id", data.messageId)
      .select()
      .single();

    if (error) throw new Error(`Failed to edit message: ${error.message}`);
    return updated;
  });

export const deleteMessageForEveryone = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      messageId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("sender_clerk_id")
      .eq("id", data.messageId)
      .single();

    if (!msg) throw new Error("Message not found");
    if (msg.sender_clerk_id !== data.clerkUserId) throw new Error("You can only delete your own messages");

    const { error } = await supabaseAdmin
      .from("messages")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        text: null,
        image_url: null,
        video_url: null,
        audio_url: null,
      })
      .eq("id", data.messageId);

    if (error) throw new Error(`Failed to delete message: ${error.message}`);
    return { success: true };
  });

export const addReaction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      messageId: z.string().uuid(),
      emoji: z.string().min(1).max(10),
    })
  )
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("message_reactions")
      .select("id")
      .eq("message_id", data.messageId)
      .eq("clerk_user_id", data.clerkUserId)
      .eq("emoji", data.emoji)
      .single();

    if (existing) {
      await supabaseAdmin.from("message_reactions").delete().eq("id", existing.id);
      return { action: "removed" as const };
    }

    await supabaseAdmin.from("message_reactions").insert({
      message_id: data.messageId,
      clerk_user_id: data.clerkUserId,
      emoji: data.emoji,
    });

    return { action: "added" as const };
  });

export const getOrCreateDirectConversation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      otherClerkId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    // Guard: messaging is only allowed between users who are accepted contacts.
    if (data.clerkUserId !== data.otherClerkId) {
      const { data: friendship } = await supabaseAdmin
        .from("contacts")
        .select("status")
        .eq("user_clerk_id", data.clerkUserId)
        .eq("contact_clerk_id", data.otherClerkId)
        .maybeSingle();

      if (!friendship || friendship.status !== "accepted") {
        throw new Error(
          "You can only message accepted contacts. Send a friend request first."
        );
      }
    }

    const { data: myConvs } = await supabaseAdmin
      .from("conversation_members")
      .select("conversation_id")
      .eq("clerk_user_id", data.clerkUserId);

    if (myConvs?.length) {
      const convIds = myConvs.map((c) => c.conversation_id);
      const { data: otherMemberships } = await supabaseAdmin
        .from("conversation_members")
        .select("conversation_id")
        .eq("clerk_user_id", data.otherClerkId)
        .in("conversation_id", convIds);

      if (otherMemberships?.length) {
        for (const om of otherMemberships) {
          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("*")
            .eq("id", om.conversation_id)
            .eq("type", "direct")
            .single();
          if (conv) return conv;
        }
      }
    }

    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .insert({ type: "direct" })
      .select()
      .single();

    if (error) throw new Error(`Failed to create conversation: ${error.message}`);

    await supabaseAdmin.from("conversation_members").insert([
      { conversation_id: conv.id, clerk_user_id: data.clerkUserId },
      { conversation_id: conv.id, clerk_user_id: data.otherClerkId },
    ]);

    return conv;
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("conversation_members")
      .update({ unread_count: 0 })
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.clerkUserId);

    return { success: true };
  });

export const createGroupConversation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      name: z.string().min(1).max(100),
      memberClerkIds: z.array(z.string().min(1).max(255)).min(1).max(50),
    })
  )
  .handler(async ({ data }) => {
    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .insert({ type: "group", name: data.name })
      .select()
      .single();

    if (error) throw new Error(`Failed to create group: ${error.message}`);

    const allMembers = [data.clerkUserId, ...data.memberClerkIds];
    const memberRows = allMembers.map((clerkId) => ({
      conversation_id: conv.id,
      clerk_user_id: clerkId,
    }));

    await supabaseAdmin.from("conversation_members").insert(memberRows);

    return conv;
  });

export const getConversationDetails = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", data.conversationId)
      .single();

    if (!conv) throw new Error("Conversation not found");

    const { data: members } = await supabaseAdmin
      .from("conversation_members")
      .select("clerk_user_id")
      .eq("conversation_id", data.conversationId);

    const clerkIds = members?.map((m) => m.clerk_user_id) || [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, is_online")
      .in("clerk_user_id", clerkIds.length ? clerkIds : ["__none__"]);

    return {
      ...conv,
      members: profiles || [],
    };
  });


// ═══════════════════════════════════════════

export const getMoments = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: moments, error } = await supabaseAdmin
      .from("moments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(`Failed to get moments: ${error.message}`);
    if (!moments?.length) return [];

    const clerkIds = [...new Set(moments.map((m) => m.clerk_user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("clerk_user_id", clerkIds);

    const momentIds = moments.map((m) => m.id);
    const { data: likes } = await supabaseAdmin
      .from("moment_likes")
      .select("moment_id, clerk_user_id")
      .in("moment_id", momentIds);

    const { data: comments } = await supabaseAdmin
      .from("moment_comments")
      .select("moment_id")
      .in("moment_id", momentIds);

    return moments.map((m) => {
      const momentLikes = likes?.filter((l) => l.moment_id === m.id) || [];
      const momentComments = comments?.filter((c) => c.moment_id === m.id) || [];
      return {
        ...m,
        profile: profiles?.find((p) => p.clerk_user_id === m.clerk_user_id) || null,
        likesCount: momentLikes.length,
        commentsCount: momentComments.length,
        likedByMe: momentLikes.some((l) => l.clerk_user_id === data.clerkUserId),
      };
    });
  });

export const uploadMomentImage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      fileName: z.string().min(1).max(255),
      fileBase64: z.string().min(1),
      contentType: z.string().min(1).max(100),
    })
  )
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.fileBase64, "base64");
    const ext = data.fileName.split(".").pop() || "jpg";
    const storagePath = `${data.clerkUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("moment-images")
      .upload(storagePath, buffer, { contentType: data.contentType, upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabaseAdmin.storage
      .from("moment-images")
      .getPublicUrl(storagePath);

    return { publicUrl: urlData.publicUrl };
  });

export const createMoment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      text: z.string().max(5000).optional(),
      imageUrl: z.string().url().max(2048).optional(),
    })
  )
  .handler(async ({ data }) => {
    if (!data.text?.trim() && !data.imageUrl) {
      throw new Error("A moment must have text or an image/video.");
    }
    const { data: moment, error } = await supabaseAdmin
      .from("moments")
      .insert({
        clerk_user_id: data.clerkUserId,
        text: data.text || null,
        image_url: data.imageUrl || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create moment: ${error.message}`);
    return moment;
  });

export const toggleMomentLike = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    momentId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("moment_likes")
      .select("id")
      .eq("moment_id", data.momentId)
      .eq("clerk_user_id", data.clerkUserId)
      .single();

    if (existing) {
      await supabaseAdmin.from("moment_likes").delete().eq("id", existing.id);
      return { liked: false };
    }

    await supabaseAdmin.from("moment_likes").insert({
      moment_id: data.momentId,
      clerk_user_id: data.clerkUserId,
    });

    return { liked: true };
  });

// ═══════════════════════════════════════════
// ALL PROFILES (for contacts page)
// ═══════════════════════════════════════════

export const getAllProfiles = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .neq("clerk_user_id", data.clerkUserId)
      .order("display_name", { ascending: true });

    if (error) throw new Error(`Failed to get profiles: ${error.message}`);
    return profiles || [];
  });

// ═══════════════════════════════════════════
// MEDIA UPLOAD FUNCTIONS
// ═══════════════════════════════════════════

export const uploadChatMedia = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
      fileName: z.string().min(1).max(255),
      fileBase64: z.string().min(1),
      contentType: z.string().min(1).max(100),
    })
  )
  .handler(async ({ data }) => {
    // Permission + TTL like sendMessage
    const { data: convPerm } = await supabaseAdmin
      .from("conversations")
      .select("type, only_admins_send, disappearing_seconds")
      .eq("id", data.conversationId)
      .single();
    if (convPerm?.type === "group" && convPerm.only_admins_send) {
      const { data: m } = await supabaseAdmin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", data.conversationId)
        .eq("clerk_user_id", data.clerkUserId)
        .maybeSingle();
      if (!m || m.role !== "admin") {
        throw new Error("Only admins can send messages in this group");
      }
    }
    const expiresAt = convPerm?.disappearing_seconds
      ? new Date(Date.now() + convPerm.disappearing_seconds * 1000).toISOString()
      : null;

    const buffer = Buffer.from(data.fileBase64, "base64");
    const ext = data.fileName.split(".").pop() || "bin";
    const storagePath = `${data.conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(storagePath, buffer, {
        contentType: data.contentType,
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabaseAdmin.storage
      .from("chat-media")
      .getPublicUrl(storagePath);

    const isVideo = data.contentType.startsWith("video/");
    const isImage = data.contentType.startsWith("image/");
    const isAudio = data.contentType.startsWith("audio/");

    const { data: message, error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_clerk_id: data.clerkUserId,
        text: null,
        image_url: isImage ? urlData.publicUrl : null,
        video_url: isVideo ? urlData.publicUrl : null,
        audio_url: isAudio ? urlData.publicUrl : null,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (msgError) throw new Error(`Failed to save message: ${msgError.message}`);

    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    // Increment unread for other members
    const { data: members } = await supabaseAdmin
      .from("conversation_members")
      .select("id, unread_count")
      .eq("conversation_id", data.conversationId)
      .neq("clerk_user_id", data.clerkUserId);

    if (members?.length) {
      for (const m of members) {
        await supabaseAdmin
          .from("conversation_members")
          .update({ unread_count: (m.unread_count || 0) + 1 })
          .eq("id", m.id);
      }
    }

    return message;
  });

// ═══════════════════════════════════════════
// MOMENT COMMENTS FUNCTIONS
// ═══════════════════════════════════════════

export const getMomentComments = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    momentId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: comments, error } = await supabaseAdmin
      .from("moment_comments")
      .select("*")
      .eq("moment_id", data.momentId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw new Error(`Failed to get comments: ${error.message}`);
    if (!comments?.length) return [];

    const clerkIds = [...new Set(comments.map((c) => c.clerk_user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url")
      .in("clerk_user_id", clerkIds);

    return comments.map((c) => ({
      ...c,
      profile: profiles?.find((p) => p.clerk_user_id === c.clerk_user_id) || null,
    }));
  });

export const addMomentComment = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    momentId: z.string().uuid(),
    text: z.string().min(1).max(2000),
  }))
  .handler(async ({ data }) => {
    const { data: comment, error } = await supabaseAdmin
      .from("moment_comments")
      .insert({
        moment_id: data.momentId,
        clerk_user_id: data.clerkUserId,
        text: data.text,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add comment: ${error.message}`);
    return comment;
  });

export const deleteMoment = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    momentId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: moment } = await supabaseAdmin
      .from("moments")
      .select("clerk_user_id")
      .eq("id", data.momentId)
      .single();

    if (!moment || moment.clerk_user_id !== data.clerkUserId) {
      throw new Error("Not authorized to delete this moment");
    }

    await supabaseAdmin.from("moment_comments").delete().eq("moment_id", data.momentId);
    await supabaseAdmin.from("moment_likes").delete().eq("moment_id", data.momentId);
    await supabaseAdmin.from("moments").delete().eq("id", data.momentId);

    return { success: true };
  });

export const deleteMomentComment = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    commentId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: comment } = await supabaseAdmin
      .from("moment_comments")
      .select("clerk_user_id")
      .eq("id", data.commentId)
      .single();

    if (!comment || comment.clerk_user_id !== data.clerkUserId) {
      throw new Error("Not authorized to delete this comment");
    }

    await supabaseAdmin.from("moment_comments").delete().eq("id", data.commentId);
    return { success: true };
  });

// ═══════════════════════════════════════════
// AVATAR UPLOAD
// ═══════════════════════════════════════════

export const uploadAvatar = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    fileBase64: z.string().min(1),
    contentType: z.string().min(1).max(100),
  }))
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.fileBase64, "base64");
    const ext = data.contentType.split("/")[1] || "jpg";
    const storagePath = `avatars/${data.clerkUserId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(storagePath, buffer, { contentType: data.contentType, upsert: true });

    if (uploadError) throw new Error(`Avatar upload failed: ${uploadError.message}`);

    const { data: urlData } = supabaseAdmin.storage
      .from("chat-media")
      .getPublicUrl(storagePath);

    await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: urlData.publicUrl })
      .eq("clerk_user_id", data.clerkUserId);

    return { publicUrl: urlData.publicUrl };
  });

// ═══════════════════════════════════════════
// GROUP MEMBER MANAGEMENT
// ═══════════════════════════════════════════

export const addGroupMember = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    memberClerkId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    // Verify conversation is a group and caller is a member
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("type")
      .eq("id", data.conversationId)
      .single();
    if (!conv || conv.type !== "group") throw new Error("Not a group conversation");

    const { data: callerMember } = await supabaseAdmin
      .from("conversation_members")
      .select("id, role")
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    if (!callerMember) throw new Error("You are not a member of this group");
    if (callerMember.role !== "admin") throw new Error("Only admins can add members");

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from("conversation_members")
      .select("id")
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.memberClerkId)
      .maybeSingle();
    if (existing) throw new Error("User is already a member");

    const { error } = await supabaseAdmin
      .from("conversation_members")
      .insert({ conversation_id: data.conversationId, clerk_user_id: data.memberClerkId, role: "member" });
    if (error) throw new Error(`Failed to add member: ${error.message}`);

    return { success: true };
  });

export const removeGroupMember = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    memberClerkId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("type")
      .eq("id", data.conversationId)
      .single();
    if (!conv || conv.type !== "group") throw new Error("Not a group conversation");

    const { data: callerMember } = await supabaseAdmin
      .from("conversation_members")
      .select("id, role")
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    if (!callerMember) throw new Error("You are not a member of this group");
    if (callerMember.role !== "admin") throw new Error("Only admins can remove members");
    if (data.memberClerkId === data.clerkUserId) throw new Error("Use leave group to remove yourself");

    const { error } = await supabaseAdmin
      .from("conversation_members")
      .delete()
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.memberClerkId);
    if (error) throw new Error(`Failed to remove member: ${error.message}`);

    return { success: true };
  });

// ═══════════════════════════════════════════
// READ RECEIPTS
// ═══════════════════════════════════════════

export const markMessagesRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    messageIds: z.array(z.string().uuid()).min(1).max(100),
  }))
  .handler(async ({ data }) => {
    const rows = data.messageIds.map((msgId) => ({
      message_id: msgId,
      clerk_user_id: data.clerkUserId,
    }));
    await supabaseAdmin
      .from("message_read_receipts")
      .upsert(rows, { onConflict: "message_id,clerk_user_id" });
    return { success: true };
  });

export const getReadReceipts = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    messageIds: z.array(z.string().uuid()).min(1).max(100),
  }))
  .handler(async ({ data }) => {
    const { data: receipts } = await supabaseAdmin
      .from("message_read_receipts")
      .select("message_id, clerk_user_id")
      .in("message_id", data.messageIds);
    return receipts || [];
  });

// ═══════════════════════════════════════════
// USERNAME / HANDLE FUNCTIONS
// ═══════════════════════════════════════════

export const checkUsernameAvailability = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    clerkUserId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id")
      .ilike("username", data.username)
      .single();

    if (!existing) return { available: true };
    if (existing.clerk_user_id === data.clerkUserId) return { available: true };
    return { available: false };
  });

export const claimUsername = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  }))
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id")
      .ilike("username", data.username)
      .single();

    if (existing && existing.clerk_user_id !== data.clerkUserId) {
      throw new Error("Username is already taken");
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ username: data.username.toLowerCase() })
      .eq("clerk_user_id", data.clerkUserId)
      .select()
      .single();

    if (error) throw new Error(`Failed to claim username: ${error.message}`);
    return profile;
  });

export const getProfileByUsername = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    username: z.string().min(1).max(30),
  }))
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .ilike("username", data.username)
      .single();

    if (error || !profile) return null;
    return profile;
  });

export const getProfileByClerkId = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", data.clerkUserId)
      .single();

    if (error || !profile) return null;
    return profile;
  });

export const searchProfilesByUsername = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    query: z.string().min(1).max(50),
    clerkUserId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    const clean = data.query.replace(/^@/, "").toLowerCase();
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .ilike("username", `${clean}%`)
      .neq("clerk_user_id", data.clerkUserId)
      .limit(10);

    return profiles || [];
  });

// ═══════════════════════════════════════════
// LEAVE GROUP
// ═══════════════════════════════════════════

export const leaveGroup = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("type")
      .eq("id", data.conversationId)
      .single();
    if (!conv || conv.type !== "group") throw new Error("Not a group conversation");

    const { error } = await supabaseAdmin
      .from("conversation_members")
      .delete()
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(`Failed to leave group: ${error.message}`);

    return { success: true };
  });

// ═══════════════════════════════════════════
// GROUP PROFILE & ADMIN FEATURES
// ═══════════════════════════════════════════

// Helper: assert caller is admin of a group (returns conversation)
async function assertGroupAdmin(clerkUserId: string, conversationId: string) {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();
  if (!conv || conv.type !== "group") throw new Error("Not a group conversation");
  const { data: m } = await supabaseAdmin
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (!m) throw new Error("You are not a member of this group");
  if (m.role !== "admin") throw new Error("Only admins can perform this action");
  return conv;
}

// Create group with name + description + avatar; creator is admin.
export const createGroup = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      avatarUrl: z.string().url().max(2048).optional(),
      memberClerkIds: z.array(z.string().min(1).max(255)).min(1).max(256),
    })
  )
  .handler(async ({ data }) => {
    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        type: "group",
        name: data.name,
        description: data.description || null,
        avatar_url: data.avatarUrl || null,
        created_by: data.clerkUserId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create group: ${error.message}`);

    const allMembers = [data.clerkUserId, ...data.memberClerkIds.filter((m) => m !== data.clerkUserId)];
    const memberRows = allMembers.map((clerkId) => ({
      conversation_id: conv.id,
      clerk_user_id: clerkId,
      role: clerkId === data.clerkUserId ? "admin" : "member",
    }));
    await supabaseAdmin.from("conversation_members").insert(memberRows);
    return conv;
  });

export const getGroupInfo = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", data.conversationId)
      .single();
    if (!conv) throw new Error("Conversation not found");

    const { data: members } = await supabaseAdmin
      .from("conversation_members")
      .select("clerk_user_id, role, joined_at, mute_until")
      .eq("conversation_id", data.conversationId);

    const ids = members?.map((m) => m.clerk_user_id) || [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, username, is_online, status_message")
      .in("clerk_user_id", ids.length ? ids : ["__none__"]);

    const myMembership = members?.find((m) => m.clerk_user_id === data.clerkUserId);

    const enriched = (members || []).map((m) => ({
      ...m,
      profile: profiles?.find((p) => p.clerk_user_id === m.clerk_user_id) || null,
    })).sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (b.role === "admin" && a.role !== "admin") return 1;
      return (a.profile?.display_name || "").localeCompare(b.profile?.display_name || "");
    });

    return {
      ...conv,
      members: enriched,
      myRole: myMembership?.role || null,
      myMuteUntil: myMembership?.mute_until || null,
    };
  });

export const updateGroupInfo = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const conv = await (async () => {
      const { data: c } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("id", data.conversationId)
        .single();
      if (!c || c.type !== "group") throw new Error("Not a group conversation");
      return c;
    })();

    const { data: m } = await supabaseAdmin
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.clerkUserId)
      .maybeSingle();
    if (!m) throw new Error("You are not a member of this group");
    if (conv.only_admins_edit && m.role !== "admin") {
      throw new Error("Only admins can edit group info");
    }

    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl;
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", data.conversationId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update group: ${error.message}`);
    return updated;
  });

export const updateGroupPermissions = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    onlyAdminsSend: z.boolean().optional(),
    onlyAdminsEdit: z.boolean().optional(),
    disappearingSeconds: z.number().int().min(0).max(60 * 60 * 24 * 90).nullable().optional(),
  }))
  .handler(async ({ data }) => {
    await assertGroupAdmin(data.clerkUserId, data.conversationId);
    const updates: Record<string, any> = {};
    if (data.onlyAdminsSend !== undefined) updates.only_admins_send = data.onlyAdminsSend;
    if (data.onlyAdminsEdit !== undefined) updates.only_admins_edit = data.onlyAdminsEdit;
    if (data.disappearingSeconds !== undefined) {
      updates.disappearing_seconds = data.disappearingSeconds && data.disappearingSeconds > 0 ? data.disappearingSeconds : null;
    }
    const { error } = await supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", data.conversationId);
    if (error) throw new Error(`Failed to update permissions: ${error.message}`);
    return { success: true };
  });

export const setGroupMemberRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    memberClerkId: z.string().min(1).max(255),
    role: z.enum(["admin", "member"]),
  }))
  .handler(async ({ data }) => {
    await assertGroupAdmin(data.clerkUserId, data.conversationId);
    if (data.role === "member") {
      // ensure at least one admin remains
      const { data: admins } = await supabaseAdmin
        .from("conversation_members")
        .select("clerk_user_id")
        .eq("conversation_id", data.conversationId)
        .eq("role", "admin");
      if ((admins?.length || 0) <= 1 && admins?.[0]?.clerk_user_id === data.memberClerkId) {
        throw new Error("Cannot demote the last admin");
      }
    }
    const { error } = await supabaseAdmin
      .from("conversation_members")
      .update({ role: data.role })
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.memberClerkId);
    if (error) throw new Error(`Failed to update role: ${error.message}`);
    return { success: true };
  });

// ═══════════════════════════════════════════
// INVITE LINKS
// ═══════════════════════════════════════════

function genInviteCode() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export const generateInviteCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    await assertGroupAdmin(data.clerkUserId, data.conversationId);
    // Try a few times to avoid collision
    let code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = genInviteCode();
      const { data: existing } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("invite_code", candidate)
        .maybeSingle();
      if (!existing) { code = candidate; break; }
    }
    if (!code) throw new Error("Could not allocate invite code, try again");
    const { error } = await supabaseAdmin
      .from("conversations")
      .update({ invite_code: code })
      .eq("id", data.conversationId);
    if (error) throw new Error(`Failed to set invite code: ${error.message}`);
    return { code };
  });

export const resetInviteCode = generateInviteCode; // alias — same behaviour overwrites previous code

export const lookupInvite = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().min(4).max(40) }))
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, name, description, avatar_url, type")
      .eq("invite_code", data.code)
      .maybeSingle();
    if (!conv || conv.type !== "group") return null;
    const { count } = await supabaseAdmin
      .from("conversation_members")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id);
    return { ...conv, memberCount: count || 0 };
  });

export const joinGroupByInvite = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    code: z.string().min(4).max(40),
  }))
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, type")
      .eq("invite_code", data.code)
      .maybeSingle();
    if (!conv || conv.type !== "group") throw new Error("Invite link is invalid or expired");
    const { data: existing } = await supabaseAdmin
      .from("conversation_members")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("clerk_user_id", data.clerkUserId)
      .maybeSingle();
    if (existing) return { conversationId: conv.id, alreadyMember: true };
    const { error } = await supabaseAdmin
      .from("conversation_members")
      .insert({ conversation_id: conv.id, clerk_user_id: data.clerkUserId, role: "member" });
    if (error) throw new Error(`Failed to join group: ${error.message}`);
    return { conversationId: conv.id, alreadyMember: false };
  });

// ═══════════════════════════════════════════
// GROUP AVATAR UPLOAD
// ═══════════════════════════════════════════

export const uploadGroupAvatar = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    fileBase64: z.string().min(1),
    contentType: z.string().min(1).max(100),
  }))
  .handler(async ({ data }) => {
    // Permission: anyone can upload if not restricted, only admins if restricted
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("only_admins_edit, type")
      .eq("id", data.conversationId)
      .single();
    if (!conv || conv.type !== "group") throw new Error("Not a group");
    if (conv.only_admins_edit) {
      await assertGroupAdmin(data.clerkUserId, data.conversationId);
    } else {
      const { data: m } = await supabaseAdmin
        .from("conversation_members")
        .select("id")
        .eq("conversation_id", data.conversationId)
        .eq("clerk_user_id", data.clerkUserId)
        .maybeSingle();
      if (!m) throw new Error("You are not a member of this group");
    }

    const buffer = Buffer.from(data.fileBase64, "base64");
    const ext = data.contentType.split("/")[1] || "jpg";
    const storagePath = `group-avatars/${data.conversationId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(storagePath, buffer, { contentType: data.contentType, upsert: true });
    if (upErr) throw new Error(`Avatar upload failed: ${upErr.message}`);
    const { data: urlData } = supabaseAdmin.storage.from("chat-media").getPublicUrl(storagePath);
    await supabaseAdmin
      .from("conversations")
      .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    return { publicUrl: urlData.publicUrl };
  });

// ═══════════════════════════════════════════
// MUTE NOTIFICATIONS (per-user)
// ═══════════════════════════════════════════

export const setConversationMute = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    muteSeconds: z.number().int().min(0).max(60 * 60 * 24 * 365).nullable(),
  }))
  .handler(async ({ data }) => {
    const muteUntil = data.muteSeconds === null
      ? null
      : data.muteSeconds === 0
        ? new Date(Date.now() + 60 * 60 * 24 * 365 * 10 * 1000).toISOString() // ~10 years = "always"
        : new Date(Date.now() + data.muteSeconds * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("conversation_members")
      .update({ mute_until: muteUntil })
      .eq("conversation_id", data.conversationId)
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(`Failed to update mute: ${error.message}`);
    return { muteUntil };
  });

// ═══════════════════════════════════════════
// PIN MESSAGES (admins in groups, anyone in 1:1)
// ═══════════════════════════════════════════

export const togglePinMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    messageId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id, pinned")
      .eq("id", data.messageId)
      .single();
    if (!msg) throw new Error("Message not found");
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("type")
      .eq("id", msg.conversation_id)
      .single();
    if (!conv) throw new Error("Conversation not found");
    if (conv.type === "group") {
      await assertGroupAdmin(data.clerkUserId, msg.conversation_id);
    } else {
      const { data: m } = await supabaseAdmin
        .from("conversation_members")
        .select("id")
        .eq("conversation_id", msg.conversation_id)
        .eq("clerk_user_id", data.clerkUserId)
        .maybeSingle();
      if (!m) throw new Error("You are not a member of this conversation");
    }
    const newPinned = !msg.pinned;
    await supabaseAdmin
      .from("messages")
      .update({
        pinned: newPinned,
        pinned_at: newPinned ? new Date().toISOString() : null,
        pinned_by: newPinned ? data.clerkUserId : null,
      })
      .eq("id", data.messageId);
    return { pinned: newPinned };
  });

export const getPinnedMessages = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .eq("pinned", true)
      .order("pinned_at", { ascending: false });
    return msgs || [];
  });

// ═══════════════════════════════════════════
// STARRED MESSAGES (per-user)
// ═══════════════════════════════════════════

export const toggleStarMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    messageId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("starred_messages")
      .select("id")
      .eq("message_id", data.messageId)
      .eq("clerk_user_id", data.clerkUserId)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from("starred_messages").delete().eq("id", existing.id);
      return { starred: false };
    }
    await supabaseAdmin.from("starred_messages").insert({
      message_id: data.messageId,
      clerk_user_id: data.clerkUserId,
    });
    return { starred: true };
  });

export const getStarredMessages = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: starred } = await supabaseAdmin
      .from("starred_messages")
      .select("message_id, starred_at")
      .eq("clerk_user_id", data.clerkUserId)
      .order("starred_at", { ascending: false })
      .limit(200);
    if (!starred?.length) return [];
    const msgIds = starred.map((s) => s.message_id);
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("*")
      .in("id", msgIds);
    if (!msgs?.length) return [];
    const convIds = [...new Set(msgs.map((m) => m.conversation_id))];
    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id, name, type, avatar_url")
      .in("id", convIds);
    const senderIds = [...new Set(msgs.map((m) => m.sender_clerk_id))];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url")
      .in("clerk_user_id", senderIds);
    return starred.map((s) => {
      const m = msgs.find((x) => x.id === s.message_id);
      if (!m) return null;
      return {
        ...m,
        starred_at: s.starred_at,
        conversation: convs?.find((c) => c.id === m.conversation_id) || null,
        sender: profs?.find((p) => p.clerk_user_id === m.sender_clerk_id) || null,
      };
    }).filter(Boolean);
  });

// ═══════════════════════════════════════════
// BLOCK / REPORT
// ═══════════════════════════════════════════

export const blockUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    targetClerkId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    if (data.clerkUserId === data.targetClerkId) throw new Error("You cannot block yourself");
    await supabaseAdmin.from("blocked_users").upsert(
      { blocker_clerk_id: data.clerkUserId, blocked_clerk_id: data.targetClerkId },
      { onConflict: "blocker_clerk_id,blocked_clerk_id" }
    );
    // Also remove any contact relationship both ways
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_clerk_id", data.clerkUserId)
      .eq("contact_clerk_id", data.targetClerkId);
    await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("user_clerk_id", data.targetClerkId)
      .eq("contact_clerk_id", data.clerkUserId);
    return { success: true };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    targetClerkId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("blocked_users")
      .delete()
      .eq("blocker_clerk_id", data.clerkUserId)
      .eq("blocked_clerk_id", data.targetClerkId);
    return { success: true };
  });

export const getBlockedUsers = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("blocked_users")
      .select("blocked_clerk_id, created_at")
      .eq("blocker_clerk_id", data.clerkUserId);
    if (!rows?.length) return [];
    const ids = rows.map((r) => r.blocked_clerk_id);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, username")
      .in("clerk_user_id", ids);
    return rows.map((r) => ({
      ...r,
      profile: profs?.find((p) => p.clerk_user_id === r.blocked_clerk_id) || null,
    }));
  });

export const isBlocked = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    targetClerkId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("blocked_users")
      .select("id")
      .eq("blocker_clerk_id", data.clerkUserId)
      .eq("blocked_clerk_id", data.targetClerkId)
      .maybeSingle();
    return { blocked: !!row };
  });

export const reportTarget = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    targetType: z.enum(["user", "group", "message"]),
    targetId: z.string().min(1).max(255),
    reason: z.string().min(1).max(1000),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("reports").insert({
      reporter_clerk_id: data.clerkUserId,
      target_type: data.targetType,
      target_id: data.targetId,
      reason: data.reason,
    });
    if (error) throw new Error(`Failed to submit report: ${error.message}`);
    return { success: true };
  });

// ═══════════════════════════════════════════
// DOCUMENT / FILE / LOCATION / CONTACT MESSAGES
// ═══════════════════════════════════════════

// Helper: resolve disappearing TTL for a conversation (returns ISO expires_at or null)
async function computeExpiresAt(conversationId: string): Promise<string | null> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("disappearing_seconds")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.disappearing_seconds) return null;
  return new Date(Date.now() + conv.disappearing_seconds * 1000).toISOString();
}

// Permission check: if only_admins_send, only admins can send.
async function assertCanSend(clerkUserId: string, conversationId: string) {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("type, only_admins_send")
    .eq("id", conversationId)
    .single();
  if (!conv) throw new Error("Conversation not found");
  if (conv.type === "group" && conv.only_admins_send) {
    const { data: m } = await supabaseAdmin
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (!m || m.role !== "admin") throw new Error("Only admins can send messages in this group");
  }
}

export const uploadDocumentMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    fileBase64: z.string().min(1),
    contentType: z.string().min(1).max(100),
    fileSize: z.number().int().min(0).max(100 * 1024 * 1024),
  }))
  .handler(async ({ data }) => {
    await assertCanSend(data.clerkUserId, data.conversationId);
    const buffer = Buffer.from(data.fileBase64, "base64");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${data.conversationId}/files/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(storagePath, buffer, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { data: urlData } = supabaseAdmin.storage.from("chat-media").getPublicUrl(storagePath);
    const expiresAt = await computeExpiresAt(data.conversationId);

    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_clerk_id: data.clerkUserId,
        file_url: urlData.publicUrl,
        file_name: data.fileName,
        file_size: data.fileSize,
        mime_type: data.contentType,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to save document: ${error.message}`);
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    // Bump unread for others
    const { data: members } = await supabaseAdmin
      .from("conversation_members")
      .select("id, unread_count")
      .eq("conversation_id", data.conversationId)
      .neq("clerk_user_id", data.clerkUserId);
    if (members?.length) {
      for (const m of members) {
        await supabaseAdmin
          .from("conversation_members")
          .update({ unread_count: (m.unread_count || 0) + 1 })
          .eq("id", m.id);
      }
    }
    return message;
  });

export const sendLocationMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(255).optional(),
  }))
  .handler(async ({ data }) => {
    await assertCanSend(data.clerkUserId, data.conversationId);
    const expiresAt = await computeExpiresAt(data.conversationId);
    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_clerk_id: data.clerkUserId,
        latitude: data.latitude,
        longitude: data.longitude,
        location_label: data.label || null,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to send location: ${error.message}`);
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    return message;
  });

export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    contactClerkId: z.string().min(1).max(255),
  }))
  .handler(async ({ data }) => {
    await assertCanSend(data.clerkUserId, data.conversationId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, username, status_message")
      .eq("clerk_user_id", data.contactClerkId)
      .single();
    if (!prof) throw new Error("Contact not found");
    const expiresAt = await computeExpiresAt(data.conversationId);
    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_clerk_id: data.clerkUserId,
        contact_payload: {
          clerk_user_id: prof.clerk_user_id,
          name: prof.display_name,
          username: prof.username,
          avatar_url: prof.avatar_url,
        },
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to share contact: ${error.message}`);
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    return message;
  });

// ═══════════════════════════════════════════
// POLLS
// ═══════════════════════════════════════════

export const createPoll = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    conversationId: z.string().uuid(),
    question: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(12),
    allowMultiple: z.boolean().optional(),
  }))
  .handler(async ({ data }) => {
    await assertCanSend(data.clerkUserId, data.conversationId);
    const { data: poll, error } = await supabaseAdmin
      .from("polls")
      .insert({
        conversation_id: data.conversationId,
        created_by: data.clerkUserId,
        question: data.question,
        allow_multiple: data.allowMultiple || false,
      })
      .select()
      .single();
    if (error || !poll) throw new Error(`Failed to create poll: ${error?.message}`);
    const optRows = data.options.map((t, i) => ({ poll_id: poll.id, text: t, position: i }));
    await supabaseAdmin.from("poll_options").insert(optRows);
    const expiresAt = await computeExpiresAt(data.conversationId);
    const { data: message, error: msgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_clerk_id: data.clerkUserId,
        poll_id: poll.id,
        text: `📊 ${data.question}`,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (msgErr) throw new Error(`Failed to send poll: ${msgErr.message}`);
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    return { poll, message };
  });

export const getPoll = createServerFn({ method: "POST" })
  .inputValidator(z.object({ pollId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: poll } = await supabaseAdmin
      .from("polls")
      .select("*")
      .eq("id", data.pollId)
      .single();
    if (!poll) return null;
    const { data: options } = await supabaseAdmin
      .from("poll_options")
      .select("*")
      .eq("poll_id", data.pollId)
      .order("position", { ascending: true });
    const { data: votes } = await supabaseAdmin
      .from("poll_votes")
      .select("option_id, clerk_user_id")
      .eq("poll_id", data.pollId);
    return {
      ...poll,
      options: (options || []).map((o) => ({
        ...o,
        votes: (votes || []).filter((v) => v.option_id === o.id).map((v) => v.clerk_user_id),
      })),
    };
  });

export const votePoll = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clerkUserId: z.string().min(1).max(255),
    pollId: z.string().uuid(),
    optionId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { data: poll } = await supabaseAdmin
      .from("polls")
      .select("allow_multiple, closed")
      .eq("id", data.pollId)
      .single();
    if (!poll) throw new Error("Poll not found");
    if (poll.closed) throw new Error("Poll is closed");

    const { data: existing } = await supabaseAdmin
      .from("poll_votes")
      .select("id, option_id")
      .eq("poll_id", data.pollId)
      .eq("clerk_user_id", data.clerkUserId);

    // Toggle vote on this option
    const sameOption = (existing || []).find((v) => v.option_id === data.optionId);
    if (sameOption) {
      await supabaseAdmin.from("poll_votes").delete().eq("id", sameOption.id);
      return { action: "removed" as const };
    }

    if (!poll.allow_multiple && existing?.length) {
      // Remove previous votes by this user before adding the new one
      await supabaseAdmin
        .from("poll_votes")
        .delete()
        .eq("poll_id", data.pollId)
        .eq("clerk_user_id", data.clerkUserId);
    }

    await supabaseAdmin.from("poll_votes").insert({
      poll_id: data.pollId,
      option_id: data.optionId,
      clerk_user_id: data.clerkUserId,
    });
    return { action: "added" as const };
  });

// ═══════════════════════════════════════════
// EXPIRED MESSAGES — sweep on read
// ═══════════════════════════════════════════

// Called whenever a chat is opened. Deletes any messages whose expires_at has passed.
export const sweepExpiredMessages = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("messages")
      .delete()
      .eq("conversation_id", data.conversationId)
      .lt("expires_at", new Date().toISOString());
    return { success: true };
  });

// ═══════════════════════════════════════════
// MEDIA GALLERY (all media in a conversation)
// ═══════════════════════════════════════════

export const getConversationMedia = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("id, image_url, video_url, audio_url, file_url, file_name, mime_type, created_at, sender_clerk_id")
      .eq("conversation_id", data.conversationId)
      .or("image_url.not.is.null,video_url.not.is.null,audio_url.not.is.null,file_url.not.is.null")
      .order("created_at", { ascending: false })
      .limit(200);
    return msgs || [];
  });

// ═══════════════════════════════════════════
// CALL HISTORY
// ═══════════════════════════════════════════

export const logCall = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      callerClerkId: z.string().min(1).max(255),
      calleeClerkId: z.string().min(1).max(255),
      kind: z.enum(["audio", "video"]),
      status: z.enum(["answered", "missed", "rejected", "cancelled"]),
      durationSeconds: z.number().int().min(0).default(0),
      startedAt: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const startedAt = data.startedAt || new Date().toISOString();
    const endedAt = new Date().toISOString();
    const { data: row, error } = await supabaseAdmin
      .from("call_logs")
      .insert({
        conversation_id: data.conversationId,
        caller_clerk_id: data.callerClerkId,
        callee_clerk_id: data.calleeClerkId,
        kind: data.kind,
        status: data.status,
        duration_seconds: data.durationSeconds,
        started_at: startedAt,
        ended_at: endedAt,
      })
      .select("*")
      .single();
    if (error) {
      // Surface but don't crash callers — call logging is best-effort
      console.error("logCall failed:", error);
      return null;
    }
    return row;
  });

export const getCallHistory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("call_logs")
      .select("*")
      .or(`caller_clerk_id.eq.${data.clerkUserId},callee_clerk_id.eq.${data.clerkUserId}`)
      .order("started_at", { ascending: false })
      .limit(150);
    if (error) {
      // Most likely the table doesn't exist yet; return empty so UI shows guidance.
      return [];
    }
    if (!rows || rows.length === 0) return [];

    const peerIds = Array.from(
      new Set(
        rows.map((r: any) =>
          r.caller_clerk_id === data.clerkUserId ? r.callee_clerk_id : r.caller_clerk_id
        )
      )
    );
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, username")
      .in("clerk_user_id", peerIds);

    const byId = new Map((profs || []).map((p: any) => [p.clerk_user_id, p]));
    return rows.map((r: any) => {
      const peerClerkId =
        r.caller_clerk_id === data.clerkUserId ? r.callee_clerk_id : r.caller_clerk_id;
      const direction = r.caller_clerk_id === data.clerkUserId ? "outgoing" : "incoming";
      return {
        ...r,
        direction,
        peerClerkId,
        peerProfile: byId.get(peerClerkId) || null,
      };
    });
  });

export const deleteCallLog = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      callLogId: z.string().uuid(),
      clerkUserId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("call_logs")
      .delete()
      .eq("id", data.callLogId)
      .or(`caller_clerk_id.eq.${data.clerkUserId},callee_clerk_id.eq.${data.clerkUserId}`);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const clearCallHistory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("call_logs")
      .delete()
      .or(`caller_clerk_id.eq.${data.clerkUserId},callee_clerk_id.eq.${data.clerkUserId}`);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ═══════════════════════════════════════════
// STORIES (24h ephemeral status updates)
// ═══════════════════════════════════════════

export const uploadStoryMedia = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      fileName: z.string().min(1).max(255),
      fileBase64: z.string(),
      contentType: z.string().min(1).max(100),
    })
  )
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.fileBase64, "base64");
    const path = `${data.clerkUserId}/${Date.now()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("story-media")
      .upload(path, buffer, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(`Failed to upload story: ${upErr.message}`);
    const { data: pub } = supabaseAdmin.storage.from("story-media").getPublicUrl(path);
    return { publicUrl: pub.publicUrl };
  });

export const createStory = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      text: z.string().max(500).optional(),
      imageUrl: z.string().url().optional(),
      backgroundColor: z.string().max(80).optional(),
    })
  )
  .handler(async ({ data }) => {
    if (!data.text && !data.imageUrl) {
      throw new Error("Story must include text or an image");
    }
    // Premium users get 7-day stories; free users get 24h
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    const isPremium = profile?.is_admin || ["premium", "pro"].includes(profile?.subscription_tier || "");
    const durationMs = isPremium ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    const { data: row, error } = await supabaseAdmin
      .from("stories")
      .insert({
        clerk_user_id: data.clerkUserId,
        text: data.text || null,
        image_url: data.imageUrl || null,
        background_color: data.backgroundColor || null,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getStories = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    // Sweep expired stories (best-effort)
    try {
      await supabaseAdmin.from("stories").delete().lt("expires_at", new Date().toISOString());
    } catch (err) {
      console.error("Expired-story sweep failed:", err);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) return { groups: [], myCount: 0 };

    const stories = rows || [];
    const userIds = Array.from(new Set(stories.map((s: any) => s.clerk_user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, username")
      .in("clerk_user_id", userIds);
    const byId = new Map((profs || []).map((p: any) => [p.clerk_user_id, p]));

    // Get which stories the viewer has already seen
    const { data: views } = await supabaseAdmin
      .from("story_views")
      .select("story_id")
      .eq("clerk_user_id", data.clerkUserId);
    const seenIds = new Set((views || []).map((v: any) => v.story_id));

    // Group by user
    const groupsMap = new Map<string, any>();
    for (const s of stories) {
      let g = groupsMap.get(s.clerk_user_id);
      if (!g) {
        g = {
          clerkUserId: s.clerk_user_id,
          profile: byId.get(s.clerk_user_id) || null,
          stories: [] as any[],
          allSeen: true,
          isMine: s.clerk_user_id === data.clerkUserId,
        };
        groupsMap.set(s.clerk_user_id, g);
      }
      const seen = seenIds.has(s.id);
      g.stories.push({ ...s, seen });
      if (!seen) g.allSeen = false;
    }

    const groups = Array.from(groupsMap.values());
    // Sort: mine first, then unseen first, then most recent
    groups.sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
      const at = a.stories[0]?.created_at || "";
      const bt = b.stories[0]?.created_at || "";
      return bt.localeCompare(at);
    });
    // Inside each group, oldest first for sequential viewing
    for (const g of groups) {
      g.stories.sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    const myCount = groups.find((g) => g.isMine)?.stories.length || 0;
    return { groups, myCount };
  });

export const markStoryViewed = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      storyId: z.string().uuid(),
      clerkUserId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("story_views")
      .upsert(
        { story_id: data.storyId, clerk_user_id: data.clerkUserId },
        { onConflict: "story_id,clerk_user_id" }
      );
    return { success: true };
  });

export const deleteStory = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      storyId: z.string().uuid(),
      clerkUserId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("stories")
      .delete()
      .eq("id", data.storyId)
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getStoryViewers = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      storyId: z.string().uuid(),
      clerkUserId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("clerk_user_id")
      .eq("id", data.storyId)
      .single();
    if (!story || story.clerk_user_id !== data.clerkUserId) {
      throw new Error("Not authorized");
    }
    const { data: views, error } = await supabaseAdmin
      .from("story_views")
      .select("clerk_user_id, viewed_at")
      .eq("story_id", data.storyId)
      .order("viewed_at", { ascending: false });
    if (error) return { viewers: [], count: 0 };
    const viewerIds = (views || []).map((v: any) => v.clerk_user_id);
    if (!viewerIds.length) return { viewers: [], count: 0 };
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, avatar_url, username")
      .in("clerk_user_id", viewerIds);
    const byId = new Map((profiles || []).map((p: any) => [p.clerk_user_id, p]));
    const viewers = (views || []).map((v: any) => ({
      clerkUserId: v.clerk_user_id,
      viewedAt: v.viewed_at,
      profile: byId.get(v.clerk_user_id) || null,
    }));
    return { viewers, count: viewers.length };
  });

export const getStoryViewCounts = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      storyIds: z.array(z.string().uuid()),
      clerkUserId: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    if (!data.storyIds.length) return {};
    const { data: views } = await supabaseAdmin
      .from("story_views")
      .select("story_id")
      .in("story_id", data.storyIds);
    const counts: Record<string, number> = {};
    for (const v of views || []) {
      counts[v.story_id] = (counts[v.story_id] || 0) + 1;
    }
    return counts;
  });

// ═══════════════════════════════════════════
// PREMIUM / SUBSCRIPTION FUNCTIONS
// ═══════════════════════════════════════════

export const getPremiumStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, hide_read_receipts, verified, bio_links, is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    const effectiveTier = profile?.is_admin ? "pro" : ((profile?.subscription_tier as string) ?? "free");
    return {
      tier: effectiveTier,
      isAdmin: profile?.is_admin === true,
      hideReadReceipts: profile?.hide_read_receipts ?? false,
      verified: profile?.verified ?? false,
      bioLinks: profile?.bio_links ?? [],
    };
  });

export const upgradePlan = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      tier: z.enum(["free", "premium", "pro"]),
    })
  )
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    if (!profile?.is_admin) {
      throw new Error("Payment required. Please pay via EcoCash and wait for admin approval to activate a plan.");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_tier: data.tier })
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(`Failed to update plan: ${error.message}`);
    return { success: true, tier: data.tier };
  });

export const updatePrivacySettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      hideReadReceipts: z.boolean().optional(),
    })
  )
  .handler(async ({ data }) => {
    const updates: Record<string, unknown> = {};
    if (data.hideReadReceipts !== undefined) updates.hide_read_receipts = data.hideReadReceipts;
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("clerk_user_id", data.clerkUserId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update privacy settings: ${error.message}`);
    return profile;
  });

export const updateBioLinks = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      bioLinks: z.array(z.object({ label: z.string().max(60), url: z.string().url().max(500) })).max(5),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ bio_links: data.bioLinks })
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(`Failed to update bio links: ${error.message}`);
    return { success: true };
  });

// ═══════════════════════════════════════════
// AI FUNCTIONS (OpenRouter)
// ═══════════════════════════════════════════

export const aiChatAssist = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      question: z.string().min(1).max(2000),
      recentMessages: z
        .array(z.object({ sender: z.string().max(100), text: z.string().max(1000) }))
        .max(10)
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    // Rate-limit: 25 AI requests per user per minute
    const { checkRateLimit } = await import("./rate-limit");
    if (!checkRateLimit(`ai:${data.clerkUserId}`, 25, 60_000)) {
      throw new Error("Too many AI requests. Please wait a moment before asking again.");
    }
    // Determine model tier from user's subscription
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    const tier = profile?.is_admin ? "pro" : (profile?.subscription_tier || "free");
    const { aiChatReply } = await import("./ai");
    const reply = await aiChatReply(data.question, data.recentMessages ?? [], tier);
    return { reply };
  });

export const translateMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      text: z.string().min(1).max(4000),
      targetLanguage: z.string().min(1).max(100),
    })
  )
  .handler(async ({ data }) => {
    // Rate-limit: 10 translations per user per minute
    const { checkRateLimit } = await import("./rate-limit");
    if (!checkRateLimit(`translate:${data.clerkUserId}`, 10, 60_000)) {
      throw new Error("Too many translation requests. Please wait a moment.");
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    const tier = profile?.is_admin ? "pro" : (profile?.subscription_tier || "free");
    const { aiTranslateText } = await import("./ai");
    const translated = await aiTranslateText(data.text, data.targetLanguage, tier);
    return { translated };
  });

// ═══════════════════════════════════════════
// CHAT WALLPAPER
// ═══════════════════════════════════════════

export const setConversationWallpaper = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
      wallpaperUrl: z.string().max(2048),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("conversation_wallpapers")
      .upsert(
        {
          clerk_user_id: data.clerkUserId,
          conversation_id: data.conversationId,
          wallpaper_url: data.wallpaperUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clerk_user_id,conversation_id" }
      );
    if (error) throw new Error(`Failed to set wallpaper: ${error.message}`);
    return { success: true };
  });

export const getConversationWallpaper = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("conversation_wallpapers")
      .select("wallpaper_url")
      .eq("clerk_user_id", data.clerkUserId)
      .eq("conversation_id", data.conversationId)
      .single();
    return { wallpaperUrl: row?.wallpaper_url ?? null };
  });

// ═══════════════════════════════════════════
// EXPORT CHAT HISTORY
// ═══════════════════════════════════════════

export const exportChatHistory = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("*, profiles:sender_clerk_id(display_name, username)")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    if (!msgs?.length) return { html: "<p>No messages to export.</p>" };

    const lines = msgs.map((m: any) => {
      const name = m.profiles?.display_name || m.profiles?.username || m.sender_clerk_id;
      const ts = new Date(m.created_at).toLocaleString();
      const body = m.is_deleted
        ? "<em>Message deleted</em>"
        : m.text
        ? m.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        : m.image_url
        ? `<img src="${m.image_url}" style="max-width:300px" />`
        : m.file_name
        ? `[File: ${m.file_name}]`
        : "[Media]";
      return `<div style="margin-bottom:8px"><strong>${name}</strong> <span style="color:#999;font-size:12px">${ts}</span><br/>${body}</div>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chat Export</title><style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222}</style></head><body><h2>Chat Export</h2>${lines.join("")}</body></html>`;
    return { html };
  });

// ═══════════════════════════════════════════
// STORY HIGHLIGHTS
// ═══════════════════════════════════════════

export const createStoryHighlight = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      title: z.string().min(1).max(60),
      storyIds: z.array(z.string().uuid()).min(1).max(100),
      coverUrl: z.string().url().max(2048).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("story_highlights")
      .insert({
        clerk_user_id: data.clerkUserId,
        title: data.title,
        story_ids: data.storyIds,
        cover_url: data.coverUrl ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create highlight: ${error.message}`);
    return row;
  });

export const getStoryHighlights = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("story_highlights")
      .select("*")
      .eq("clerk_user_id", data.clerkUserId)
      .order("created_at", { ascending: true });
    return rows ?? [];
  });

export const deleteStoryHighlight = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      highlightId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("story_highlights")
      .delete()
      .eq("id", data.highlightId)
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(`Failed to delete highlight: ${error.message}`);
    return { success: true };
  });

// ═══════════════════════════════════════════
// SCHEDULED MESSAGES
// ═══════════════════════════════════════════

export const scheduleMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
      text: z.string().min(1).max(4000),
      scheduledFor: z.string().datetime(),
    })
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("scheduled_messages")
      .insert({
        clerk_user_id: data.clerkUserId,
        conversation_id: data.conversationId,
        text: data.text,
        scheduled_for: data.scheduledFor,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to schedule message: ${error.message}`);
    return row;
  });

export const getScheduledMessages = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      conversationId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("scheduled_messages")
      .select("*")
      .eq("clerk_user_id", data.clerkUserId)
      .eq("conversation_id", data.conversationId)
      .eq("sent", false)
      .order("scheduled_for", { ascending: true });
    return rows ?? [];
  });

export const cancelScheduledMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      messageId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("scheduled_messages")
      .delete()
      .eq("id", data.messageId)
      .eq("clerk_user_id", data.clerkUserId);
    if (error) throw new Error(`Failed to cancel scheduled message: ${error.message}`);
    return { success: true };
  });


// ═══════════════════════════════════════════════════════════════
// EcoCash P2P Payment Verification System
// ═══════════════════════════════════════════════════════════════

export const getEcoCashSettings = createServerFn({ method: "POST" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("ecocash_settings")
      .select("*")
      .single();
    return data || { usd_to_zig_rate: 13.5, ecocash_number: "0788800342" };
  });

export const updateEcoCashSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      usdToZigRate: z.number().positive(),
      ecocashNumber: z.string().min(9).max(15),
    })
  )
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    if (!profile?.is_admin) throw new Error("Access denied.");
    const { error } = await supabaseAdmin
      .from("ecocash_settings")
      .update({ usd_to_zig_rate: data.usdToZigRate, ecocash_number: data.ecocashNumber, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getIsAdmin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    return { isAdmin: profile?.is_admin === true };
  });

export const uploadPaymentScreenshot = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      fileBase64: z.string().min(1),
      mimeType: z.enum(["image/jpeg", "image/png"]),
      fileName: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.fileBase64, "base64");
    const ext = data.mimeType === "image/jpeg" ? "jpg" : "png";
    const path = `receipts/${data.clerkUserId}/${Date.now()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("payment-receipts")
      .upload(path, buffer, { contentType: data.mimeType, upsert: false });
    if (error) throw new Error(`Screenshot upload failed: ${error.message}`);
    const { data: urlData } = supabaseAdmin.storage.from("payment-receipts").getPublicUrl(path);
    return { url: urlData.publicUrl };
  });

export const submitPayment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      displayName: z.string().max(100).optional(),
      amount: z.number().positive(),
      currency: z.enum(["USD", "ZiG"]),
      transactionId: z.string().min(1).max(25),
      screenshotUrl: z.string().url().optional(),
      disputeNote: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data }) => {
    const normalizedTxId = data.transactionId.toUpperCase().trim();
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("transaction_id", normalizedTxId)
      .maybeSingle();
    if (existing) throw new Error("This transaction ID has already been submitted. If this is an error, use the dispute option.");
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: data.clerkUserId,
        user_display_name: data.displayName || null,
        amount: data.amount,
        currency: data.currency,
        transaction_id: normalizedTxId,
        status: "pending",
        screenshot_url: data.screenshotUrl || null,
        dispute_note: data.disputeNote || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return payment;
  });

export const getUserPayments = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("user_id", data.clerkUserId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const getAdminPayments = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      status: z.enum(["pending", "approved", "rejected"]).optional().default("pending"),
    })
  )
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    if (!profile?.is_admin) throw new Error("Access denied. Admin privileges required.");
    const { data: rows, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("status", data.status)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const verifyOrder = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clerkUserId: z.string().min(1).max(255),
      paymentId: z.string().uuid(),
      action: z.enum(["approved", "rejected"]),
      rejectionReason: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("clerk_user_id", data.clerkUserId)
      .single();
    if (!profile?.is_admin) throw new Error("Access denied. Admin privileges required.");

    const { data: payment, error: fetchErr } = await supabaseAdmin
      .from("payments")
      .select("user_id, amount, currency")
      .eq("id", data.paymentId)
      .eq("status", "pending")
      .single();
    if (fetchErr || !payment) throw new Error("Payment not found or already processed.");

    const { error } = await supabaseAdmin
      .from("payments")
      .update({
        status: data.action,
        approved_by: data.clerkUserId,
        processed_at: new Date().toISOString(),
        rejection_reason: data.rejectionReason || null,
      })
      .eq("id", data.paymentId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    if (data.action === "approved") {
      const amountUSD = payment.currency === "USD" ? payment.amount : payment.amount / 13.5;
      const tier = amountUSD >= 9.99 ? "pro" : "premium";
      await supabaseAdmin
        .from("profiles")
        .update({ subscription_tier: tier })
        .eq("clerk_user_id", payment.user_id);
    }

    return { success: true };
  });

// ═══════════════════════════════════════════
// CALL ICE SERVERS (TURN/STUN)
// ═══════════════════════════════════════════
// Generates short-lived TURN credentials using the coturn "use-auth-secret"
// mechanism (RFC 5766 / draft-uberti-behave-turn-rest-00).
//
// How it works:
//   username = "<unix_expiry_timestamp>:neative"
//   password = base64( HMAC-SHA1(username, TURN_SECRET) )
//
// coturn verifies the HMAC on its side using the same shared secret, and
// rejects the credential once the embedded timestamp has expired.
//
// Required env vars:
//   TURN_SECRET  — shared secret set in coturn via `use-auth-secret` /
//                  `static-auth-secret`
//   TURN_URLS    — comma-separated TURN URL(s), e.g.:
//                  "turn:turn.example.com:3478,turns:turn.example.com:5349"
//
// Optional:
//   TURN_TTL_SECONDS — credential lifetime in seconds (default: 3600)
//
// If TURN_SECRET / TURN_URLS are not set, falls back to STUN-only.
// STUN works for most home/office networks but fails on symmetric NAT
// (common on cellular data).
//
// Minimal coturn docker-compose snippet:
//   coturn:
//     image: coturn/coturn:latest
//     network_mode: host
//     command: >
//       -n --log-file=stdout
//       --use-auth-secret
//       --static-auth-secret=${TURN_SECRET}
//       --realm=example.com
//       --no-multicast-peers
//       --no-cli
//
export const getIceServers = createServerFn({ method: "POST" })
  .inputValidator(z.object({}).optional())
  .handler(async () => {
  const stun = [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "stun:stun.l.google.com:19302" },
  ];

  // ── Self-hosted coturn (preferred when configured) ─────────────────────
  // TURN_URLS can be set explicitly ("turn:host:3478,turn:host:3478?transport=tcp"),
  // or, if not set, it's built automatically from TURN_PUBLIC_HOST + TURN_PORT.
  const secret = process.env.TURN_SECRET;
  const explicitTurnUrls = process.env.TURN_URLS;
  const turnHost = process.env.TURN_PUBLIC_HOST;
  const turnPort = process.env.TURN_PORT || "3478";

  const turnUrlsRaw =
    explicitTurnUrls && explicitTurnUrls.trim()
      ? explicitTurnUrls
      : turnHost
      ? `turn:${turnHost}:${turnPort},turn:${turnHost}:${turnPort}?transport=tcp`
      : undefined;

  if (secret && turnUrlsRaw) {
    const ttl = parseInt(process.env.TURN_TTL_SECONDS || "3600", 10);
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const username = `${expiry}:webrtc`;
    const { createHmac } = await import("node:crypto");
    const password = createHmac("sha1", secret).update(username).digest("base64");
    const turnUrls = turnUrlsRaw.split(",").map((u: string) => u.trim()).filter(Boolean);
    return { iceServers: [...stun, { urls: turnUrls, username, credential: password }] };
  }

  // ── Metered.ca static credentials (fallback, third-party hosted) ───────
  const meteredUsername = process.env.TURN_USERNAME;
  const meteredCredential = process.env.TURN_CREDENTIAL;

  if (meteredUsername && meteredCredential) {
    return {
      iceServers: [
        ...stun,
        { urls: "turn:standard.relay.metered.ca:80", username: meteredUsername, credential: meteredCredential },
        { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: meteredUsername, credential: meteredCredential },
        { urls: "turn:standard.relay.metered.ca:443", username: meteredUsername, credential: meteredCredential },
        { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: meteredUsername, credential: meteredCredential },
      ],
    };
  }

  console.warn("[Calls] No TURN credentials set — STUN only. Calls may fail behind strict NAT.");
  return { iceServers: stun };
});

// ═══════════════════════════════════════════
// FRIEND SUGGESTIONS
// ═══════════════════════════════════════════
export const getFriendSuggestions = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clerkUserId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    // Get my contacts (all statuses)
    const { data: myContacts } = await supabaseAdmin
      .from("contacts")
      .select("contact_clerk_id")
      .eq("user_clerk_id", data.clerkUserId);

    const myContactIds = new Set((myContacts || []).map((c) => c.contact_clerk_id));
    myContactIds.add(data.clerkUserId);

    // Get contacts of my contacts (mutual friends)
    if (myContactIds.size <= 1) {
      // No contacts yet — return some recent profiles
      const { data: recent } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .neq("clerk_user_id", data.clerkUserId)
        .not("display_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(8);
      return (recent || []).map((p) => ({ ...p, mutualCount: 0 }));
    }

    const contactIdArray = Array.from(myContactIds).filter((id) => id !== data.clerkUserId);
    const { data: secondDegree } = await supabaseAdmin
      .from("contacts")
      .select("contact_clerk_id, user_clerk_id")
      .in("user_clerk_id", contactIdArray)
      .eq("status", "accepted")
      .neq("contact_clerk_id", data.clerkUserId);

    if (!secondDegree?.length) {
      const { data: recent } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .neq("clerk_user_id", data.clerkUserId)
        .not("display_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(8);
      return (recent || []).map((p) => ({ ...p, mutualCount: 0 }));
    }

    // Count mutual connections
    const mutualMap = new Map<string, number>();
    for (const row of secondDegree) {
      if (!myContactIds.has(row.contact_clerk_id)) {
        mutualMap.set(row.contact_clerk_id, (mutualMap.get(row.contact_clerk_id) || 0) + 1);
      }
    }

    if (mutualMap.size === 0) {
      const { data: recent } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .neq("clerk_user_id", data.clerkUserId)
        .not("display_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(8);
      return (recent || []).map((p) => ({ ...p, mutualCount: 0 }));
    }

    const suggestedIds = Array.from(mutualMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("clerk_user_id", suggestedIds);

    return (profiles || []).map((p) => ({
      ...p,
      mutualCount: mutualMap.get(p.clerk_user_id) || 0,
    }));
  });

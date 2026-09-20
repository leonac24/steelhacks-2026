import { Ionicons } from "@expo/vector-icons";
import { useThemeColor, useToast } from "heroui-native";
import { Pressable, View } from "react-native";

import { MemberSwitcher } from "@/components/member-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

// Right side of every drawer header: member picker, theme toggle, sign out.
// Mirrors the web header's MemberSwitcher + UserMenu (apps/web/src/routes/_auth/route.tsx).
export function HeaderActions() {
  const { toast } = useToast();
  const foregroundColor = useThemeColor("foreground");

  function handleSignOut() {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear();
        },
        onError: (error) => {
          toast.show({
            variant: "danger",
            label: error.error?.message || "Failed to sign out",
          });
        },
      },
    });
  }

  return (
    <View className="flex-row items-center gap-1 pr-3">
      <MemberSwitcher />
      <ThemeToggle />
      <Pressable onPress={handleSignOut} className="px-2.5" hitSlop={8}>
        <Ionicons name="log-out-outline" size={20} color={foregroundColor} />
      </Pressable>
    </View>
  );
}

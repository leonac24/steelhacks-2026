import { Ionicons } from "@expo/vector-icons";
import { Drawer } from "expo-router/drawer";
import { Spinner, useThemeColor } from "heroui-native";
import { useCallback } from "react";
import { Text, View } from "react-native";

import { AuthScreen } from "@/components/auth-screen";
import { HeaderActions } from "@/components/header-actions";
import { authClient } from "@/lib/auth-client";

type IconName = keyof typeof Ionicons.glyphMap;

const SCREENS: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Dashboard", icon: "grid-outline" },
  { name: "bank", title: "Accounts", icon: "wallet-outline" },
  { name: "transactions", title: "Transactions", icon: "receipt-outline" },
  { name: "budget", title: "Budget", icon: "pie-chart-outline" },
  { name: "approvals", title: "Approvals", icon: "checkmark-circle-outline" },
  { name: "notifications", title: "Notifications", icon: "notifications-outline" },
];

function DrawerLayout() {
  const themeColorForeground = useThemeColor("foreground");
  const themeColorBackground = useThemeColor("background");
  const { data: session, isPending } = authClient.useSession();

  const renderHeaderActions = useCallback(() => <HeaderActions />, []);

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" />
      </View>
    );
  }

  if (!session?.user) {
    return <AuthScreen />;
  }

  return (
    <Drawer
      screenOptions={{
        headerTintColor: themeColorForeground,
        headerStyle: { backgroundColor: themeColorBackground },
        headerTitleStyle: {
          fontWeight: "600",
          color: themeColorForeground,
        },
        headerRight: renderHeaderActions,
        drawerStyle: { backgroundColor: themeColorBackground },
      }}
    >
      {SCREENS.map(({ name, title, icon }) => (
        <Drawer.Screen
          key={name}
          name={name}
          options={{
            headerTitle: title,
            title,
            drawerLabel: ({ color, focused }) => (
              <Text style={{ color: focused ? color : themeColorForeground }}>{title}</Text>
            ),
            drawerIcon: ({ size, color, focused }) => (
              <Ionicons name={icon} size={size} color={focused ? color : themeColorForeground} />
            ),
          }}
        />
      ))}
    </Drawer>
  );
}

export default DrawerLayout;

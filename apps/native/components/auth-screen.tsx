import { Button } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";

// Shown instead of the drawer when there is no session; mirrors the web's
// redirect to /login in apps/web/src/routes/_auth/route.tsx.
export function AuthScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  return (
    <Container className="p-6">
      <View className="py-8">
        <Text className="text-4xl font-bold text-foreground">NestEgg</Text>
        <Text className="text-muted mt-1 text-sm">
          {mode === "sign-in" ? "Sign in to your caretaker account" : "Create a caretaker account"}
        </Text>
      </View>

      {mode === "sign-in" ? <SignIn /> : <SignUp />}

      <Button
        variant="ghost"
        className="mt-4 self-center"
        onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
      >
        <Button.Label>
          {mode === "sign-in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </Button.Label>
      </Button>
    </Container>
  );
}

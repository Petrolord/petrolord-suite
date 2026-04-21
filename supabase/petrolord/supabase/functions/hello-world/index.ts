Deno.serve(() => {
  return new Response("Hello from backend-native run apply", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
});

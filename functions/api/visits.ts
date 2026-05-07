interface Env {
  VISITS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.VISITS.get('count');
  const count = parseInt(raw ?? '0', 10) + 1;
  await env.VISITS.put('count', String(count));
  return new Response(JSON.stringify({ count }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

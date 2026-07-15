import "../load-env";
import { sdQueryProbe } from "../services/socialdata/client";

const appId = 29;

async function main() {
  const ch = await sdQueryProbe<{
    listChannel: { total: number; results: unknown[] };
  }>(
    `query listChannel($appId: UInt32!) {
      listChannel(page: 1, perPage: 10, appId: $appId) {
        total
        results { id plat sub alias name url status privacy }
      }
    }`,
    { appId },
  );
  console.log("=== CHANNELS ===");
  console.log(JSON.stringify(ch, null, 2));

  const cred = await sdQueryProbe<{
    listChannelCredential: { total: number; results: unknown[] };
  }>(
    `query listChannelCredential($appId: UInt32!) {
      listChannelCredential(page: 1, perPage: 10, appId: $appId) {
        total
        results { id channelId credentialId }
      }
    }`,
    { appId },
  );
  console.log("=== CHANNEL CREDENTIALS (API_CONNECTED) ===");
  console.log(JSON.stringify(cred, null, 2));

  const posts = await sdQueryProbe<{
    listPost: { total: number; results: unknown[] };
  }>(
    `query listPost($appId: UInt32!) {
      listPost(page: 1, perPage: 5, appId: $appId) {
        total
        results { id channelId sub alias type name url tags createdAt }
      }
    }`,
    { appId },
  );
  console.log("=== POSTS ===");
  console.log(JSON.stringify(posts, null, 2));

  const postTotal = posts.data?.listPost?.total ?? 0;
  if (postTotal > 0) {
    const first = (posts.data?.listPost?.results as Array<{ id: number }>)?.[0];
    if (first?.id) {
      const detail = await sdQueryProbe(
        `query getPost($id: UInt32!, $appId: UInt32!) {
          getPost(id: $id, withMetrics: true, metricDuration: 7, appId: $appId) {
            id channelId sub alias type name url tags createdAt metrics thumbnail
          }
        }`,
        { id: first.id, appId },
      );
      console.log("=== POST DETAIL (sample) ===");
      console.log(JSON.stringify(detail, null, 2));
    }
  }

  const pt = await sdQueryProbe(`query { postTypes { id name } platforms { id name } }`);
  console.log("=== POST TYPES / PLATFORMS ===");
  console.log(JSON.stringify(pt, null, 2));

  const all = await sdQueryProbe<{
    listChannel: { total: number; results: Array<{ id: number; name: string; url: string; status: number; plat: number }> };
  }>(
    `query listAllChannels($appId: UInt32!) {
      listChannel(page: 1, perPage: 100, appId: $appId) {
        total
        results { id name url status plat alias }
      }
    }`,
    { appId },
  );
  const allChannels = all.data?.listChannel?.results ?? [];
  const statusCounts: Record<number, number> = {};
  for (const c of allChannels) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  console.log("=== CHANNEL STATUS COUNTS ===", statusCounts);
  const connected = allChannels.filter((c) => c.status === 3);
  console.log("=== API_CONNECTED CHANNELS ===");
  console.log(`count=${connected.length} / total=${all.data?.listChannel?.total}`);
  console.log(JSON.stringify(connected, null, 2));

  if (connected[0]) {
    const detail = await sdQueryProbe(
      `query getChannel($id: UInt32!, $appId: UInt32!) {
        getChannel(id: $id, withMetrics: true, appId: $appId) {
          id name url status plat alias metrics
        }
      }`,
      { id: connected[0].id, appId },
    );
    console.log("=== API_CONNECTED CHANNEL METRICS (sample) ===");
    console.log(JSON.stringify(detail, null, 2));
  }

  const insight = await sdQueryProbe(
    `query listPageInsight($appId: UInt32!) {
      listPageInsight(page: 1, perPage: 5, appId: $appId) {
        total
        results {
          id
          channelId
          periodId
          metrics
          createdAt
        }
      }
    }`,
    { appId },
  );
  console.log("=== PAGE INSIGHTS ===");
  console.log(JSON.stringify(insight, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { loadConfig } from "./config";
import { createRepository } from "./repositories/createRepository";
import { buildServer } from "./server";

const config = loadConfig();
const repository = await createRepository(config);
const server = await buildServer(repository);

try {
  await server.listen({ port: config.port, host: config.host });
  server.log.info(`API listening on http://${config.host}:${config.port} with ${repository.kind} persistence`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}

import {
  normalizePageSize,
  type PageRequest,
} from "../../../shared/application/pagination";
import type { RequestPrincipal } from "../../../shared/presentation/request-principal";
import { assertSystemAdmin, assertTargetExists } from "../../identity/domain/access.policy";
import type { IdentityRepository } from "../../identity/application/identity.repository";
import type { AuditEventPageDto } from "./audit-events.dto";
import { toAuditEventPageDto } from "./audit-events.dto";
import type { AuditEventRepository } from "./audit-events.repository";

export interface AuditTrailServiceDependencies {
  readonly repository: AuditEventRepository;
  readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;
}

export class AuditTrailService {
  private readonly repository: AuditEventRepository;
  private readonly accountReader: Pick<IdentityRepository, "findAccountByUserId">;

  constructor(dependencies: AuditTrailServiceDependencies) {
    this.repository = dependencies.repository;
    this.accountReader = dependencies.accountReader;
  }

  async listEvents(principal: RequestPrincipal, page: PageRequest): Promise<AuditEventPageDto> {
    await this.authorize(principal);
    const limit = normalizePageSize(page.limit);
    const normalized: PageRequest = page.cursor === undefined
      ? { limit }
      : { limit, cursor: page.cursor };
    return toAuditEventPageDto(await this.repository.list(normalized));
  }

  private async authorize(principal: RequestPrincipal): Promise<void> {
    const account = await this.accountReader.findAccountByUserId(principal.userId);
    assertTargetExists(account);
    assertSystemAdmin(account);
  }
}

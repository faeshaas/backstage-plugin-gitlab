import { DiscoveryApi } from '@backstage/core-plugin-api';
import {
    ContributorData,
    MergeRequest,
    PipelineObject,
    UserDetail,
} from '../components/types';
import { parseCodeOwners } from '../components/utils';
import { IssueObject } from './../components/types';
import {
    CodeOwners,
    ContributorsSummary,
    GitlabCIApi,
    IssuesSummary,
    LanguagesSummary,
    MergeRequestsStatusSummary,
    MergeRequestsSummary,
    PipelineSummary,
} from './GitlabCIApi';

export class GitlabCIClient implements GitlabCIApi {
    discoveryApi: DiscoveryApi;
    baseUrl: string;
    proxyPath: string;
    codeOwnersPath: string;

    constructor({
        discoveryApi,
        baseUrl = 'https://gitlab.com/',
        proxyPath,
        codeOwnersPath,
    }: {
        discoveryApi: DiscoveryApi;
        baseUrl?: string;
        proxyPath?: string;
        codeOwnersPath?: string;
    }) {
        this.discoveryApi = discoveryApi;
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        this.proxyPath = proxyPath || '/gitlabci';
        this.codeOwnersPath = codeOwnersPath || 'CODEOWNERS';
    }

    protected async callApi<T>(
        path: string,
        query: { [key in string]: any }
    ): Promise<T | null> {
        const apiUrl = `${await this.discoveryApi.getBaseUrl('proxy')}${
            this.proxyPath
        }`;
        const response = await fetch(
            `${apiUrl}/${path}?${new URLSearchParams(query).toString()}`
        );
        if (response.status === 200) {
            return (await response.json()) as T;
        }
        return null;
    }

    async getPipelineSummary(
        projectID?: string
    ): Promise<PipelineSummary | undefined> {
        const pipelineObjects = await this.callApi<PipelineObject[]>(
            'projects/' + projectID + '/pipelines',
            {}
        );
        const projectObj: any = await this.callApi<Record<string, unknown>>(
            'projects/' + projectID,
            {}
        );
        if (pipelineObjects) {
            pipelineObjects.forEach((element: PipelineObject) => {
                element.project_name = projectObj?.name;
            });
        }
        return {
            getPipelinesData: pipelineObjects!,
        };
    }

    async getIssuesSummary(
        projectId: string
    ): Promise<IssuesSummary | undefined> {
        const issuesObject = await this.callApi<IssueObject[]>(
            `projects/${projectId}/issues`,
            {}
        );

        const projectObj: any = await this.callApi<Record<string, unknown>>(
            'projects/' + projectId,
            {}
        );
        if (issuesObject) {
            issuesObject.forEach((element: IssueObject) => {
                element.project_name = projectObj?.name;
            });
        }

        return {
            getIssuesData: issuesObject!,
        };
    }

    async getProjectName(projectID?: string): Promise<string | undefined> {
        const projectObj: any = await this.callApi<Record<string, unknown>>(
            'projects/' + projectID,
            {}
        );
        return projectObj?.name;
    }

    private async getUserProfilesData(
        contributorsData: ContributorData[]
    ): Promise<ContributorData[]> {
        for (let i = 0; contributorsData && i < contributorsData.length; i++) {
            const userProfile: any = await this.callApi<
                Record<string, unknown>[]
            >('users', {
                search: contributorsData[i].email,
            });
            if (userProfile) {
                userProfile.forEach((userProfileElement: ContributorData) => {
                    if (userProfileElement.name == contributorsData[i].name) {
                        contributorsData[i].avatar_url =
                            userProfileElement?.avatar_url;
                    }
                });
            }
        }
        return contributorsData;
    }

    async getMergeRequestsSummary(
        projectID?: string
    ): Promise<MergeRequestsSummary | undefined> {
        const mergeRquestsList = await this.callApi<MergeRequest[]>(
            'projects/' + projectID + '/merge_requests',
            {}
        );
        return {
            getMergeRequestsData: mergeRquestsList!,
        };
    }

    async getMergeRequestsStatusSummary(
        projectID?: string,
        count?: number
    ): Promise<MergeRequestsStatusSummary | undefined> {
        const mergeRequestsList = await this.callApi<MergeRequest[]>(
            'projects/' + projectID + '/merge_requests',
            { per_page: count }
        );
        return {
            getMergeRequestsStatusData: mergeRequestsList!,
        };
    }

    async getContributorsSummary(
        projectID?: string
    ): Promise<ContributorsSummary | undefined> {
        const contributorsData = await this.callApi<ContributorData[]>(
            'projects/' + projectID + '/repository/contributors',
            { sort: 'desc' }
        );
        const updatedContributorsData = await this.getUserProfilesData(
            contributorsData!
        );
        return {
            getContributorsData: updatedContributorsData!,
        };
    }

    async getLanguagesSummary(
        projectID?: string
    ): Promise<LanguagesSummary | undefined> {
        const languageObjects = await this.callApi<Record<string, unknown>>(
            'projects/' + projectID + '/languages',
            {}
        );
        return {
            getLanguagesData: languageObjects!,
        };
    }

    async getProjectDetails(projectSlug?: string): Promise<any | undefined> {
        let projectDetails: any;
        if (projectSlug) {
            projectDetails = await this.callApi<Record<string, unknown>>(
                'projects/' + encodeURIComponent(projectSlug),
                {}
            );
        }
        return projectDetails;
    }

    async retryPipelineBuild(
        projectID?: string,
        pipelineID?: string
    ): Promise<any | undefined> {
        const retryBuild = await this.callApi<Record<string, unknown>>(
            'projects/' + projectID + '/pipelines/' + pipelineID + '/retry',
            {}
        );
        return retryBuild;
    }

    async getCodeOwners(
        projectID?: string,
        branch = 'HEAD',
        filePath = this.codeOwnersPath
    ): Promise<CodeOwners> {
        // Removing starting './'
        if (filePath.startsWith('./')) filePath = filePath.slice(2);

        const codeOwnersStr = await this.callApi<string>(
            `projects/${projectID}/repository/files/${encodeURI(filePath)}/raw`,
            { ref: branch }
        );

        return {
            getCodeOwners: parseCodeOwners(codeOwnersStr || ''),
        };
    }

    async getUserDetail(username: string): Promise<UserDetail> {
        if (username.startsWith('@')) {
            username = username.slice(1);
        }
        const userDetail = (
            await this.callApi<UserDetail[]>('users', { username })
        )?.[0];

        if (!userDetail) throw new Error(`user ${username} does not exist`);

        return userDetail;
    }
}

import * as request from 'request';
import { Writable } from 'stream';
import { KubeConfig } from './config';
import { HttpError, ObjectSerializer } from './gen/api';

export interface LogOptions {
    /**
     * Follow the log stream of the pod. Defaults to false.
     */
    follow?: boolean;

    /**
     * If set, the number of bytes to read from the server before terminating the log output. This may not display a
     * complete final line of logging, and may return slightly more or slightly less than the specified limit.
     */
    limitBytes?: number;

    /**
     * If true, then the output is pretty printed.
     */
    pretty?: boolean;

    /**
     * Return previous terminated container logs. Defaults to false.
     */
    previous?: boolean;

    /**
     * A relative time in seconds before the current time from which to show logs. If this value precedes the time a
     * pod was started, only logs since the pod start will be returned. If this value is in the future, no logs will
     * be returned. Only one of sinceSeconds or sinceTime may be specified.
     */
    sinceSeconds?: number;

    /**
     * If set, the number of lines from the end of the logs to show. If not specified, logs are shown from the creation
     * of the container or sinceSeconds or sinceTime
     */
    tailLines?: number;

    /**
     * If true, add an RFC3339 or RFC3339Nano timestamp at the beginning of every line of log output. Defaults to false.
     */
    timestamps?: boolean;
}

export class Log {
    public config: KubeConfig;

    public constructor(config: KubeConfig) {
        this.config = config;
    }

    public async log(
        namespace: string,
        podName: string,
        containerName: string,
        stream: Writable,
        options?: LogOptions,
    ): Promise<request.Request>;
    /** @deprecated done callback is deprecated */
    public async log(
        namespace: string,
        podName: string,
        containerName: string,
        stream: Writable,
        done: (err: any) => void,
        options?: LogOptions,
    ): Promise<request.Request>;
    public async log(
        namespace: string,
        podName: string,
        containerName: string,
        stream: Writable,
        doneOrOptions?: ((err: any) => void) | LogOptions,
        options?: LogOptions,
    ): Promise<request.Request> {
        let done: (err: any) => void = () => undefined;
        if (typeof doneOrOptions === 'function') {
            done = doneOrOptions;
        } else {
            options = doneOrOptions;
        }

        const path = `/api/v1/namespaces/${namespace}/pods/${podName}/log`;

        const cluster = this.config.getCurrentCluster();
        if (!cluster) {
            throw new Error('No currently active cluster');
        }
        const url = cluster.server + path;

        const requestOptions: request.Options = {
            method: 'GET',
            qs: {
                ...options,
                container: containerName,
            },
            uri: url,
        };
        await this.config.applyToRequest(requestOptions);

        return new Promise((resolve, reject) => {
            const req = request(requestOptions, (error, response, body) => {
                if (error) {
                    reject(error);
                    done(error);
                } else if (response.statusCode !== 200) {
                    try {
                        const deserializedBody = ObjectSerializer.deserialize(JSON.parse(body), 'V1Status');
                        reject(new HttpError(response, deserializedBody, response.statusCode));
                    } catch (e) {
                        reject(new HttpError(response, body, response.statusCode));
                    }
                    done(body);
                } else {
                    done(null);
                }
            }).on('response', (response) => {
                if (response.statusCode === 200) {
                    req.pipe(stream);
                    resolve(req);
                }
            });
        });
    }
}

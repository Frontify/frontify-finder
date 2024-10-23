import { FinderError } from './Exception';
import { logMessage } from './Logger';
import { httpCall } from './Utils';
import { version } from '../package.json';

type Options = {
    domain: string;
    bearerToken: string;
    permanentDownloadUrls: boolean;
};

type AssetsResponse = {
    errors?: AssetsResponseError[];
    data?: {
        assets: FrontifyAsset[];
    };
    extensions: {
        beta?: AssetsResponseBetaExtension[];
        complexityScore: number;
    };
};

type AssetsResponseError = {
    extensions: {
        category: string;
    };
    locations: AssetsResponseErrorLocation[];
    message: string;
};

type AssetsResponseErrorLocation = {
    column: number;
    line: number;
};

type AssetsResponseBetaExtension = {
    message: string;
};

export type Asset = {
    id: number | string;
};

export type FrontifyAsset = {
    id: string;
    title: string;
    description: string;
    creator: {
        name: string;
    };
    createdAt: string;
    type: string;
    author: string;
    expiresAt?: string;
    licenses?: {
        title: string;
        text: string;
    };
    copyright?: {
        status: string;
        notice: string;
    };
    tags?: {
        value: string;
        source: string;
    };
    metadataValues?: {
        value: string | number;
        metadataField: {
            id: string;
            label: string;
        };
    };
    filename: string;
    extension: string;
    size: number;
    downloadUrl?: string;
    previewUrl?: string;
    dynamicPreviewUrl?: string;
    thumbnailUrl?: string;
    icon?: string;
    focalPoint?: number[];
    width?: number;
    height?: number;
    duration?: number;
    bitrate?: number;
    pageCount?: number;
};

const ASSET_BY_IDS_QUERY = `
query AssetByIds($ids: [ID!]!, $permanent: Boolean!) {
  assets(ids: $ids) {
    id
    title
    description
    type: __typename
    creator {
      name
    }
    createdAt
    expiresAt
    ...withMetadata
    ...onImage
    ...onDocument
    ...onFile
    ...onAudio
    ...onVideo
  }
}

fragment withMetadata on Asset {
  tags {
    value
    source
  }
  metadataValues {
    value
    metadataField {
      id
      label
    }
  }
  copyright {
    status
    notice
  }
  licenses {
    title
    text: license
  }
}

fragment onImage on Image {
  author
  filename
  extension
  size
  downloadUrl(permanent: $permanent)
  previewUrl
  dynamicPreviewUrl
  thumbnailUrl
  width
  height
  focalPoint
}

fragment onFile on File {
  author
  filename
  extension
  size
  downloadUrl(permanent: $permanent)
  icon: previewUrl
  dynamicPreviewUrl
  thumbnailUrl
}

fragment onDocument on Document {
  author
  filename
  extension
  size
  pageCount
  downloadUrl(permanent: $permanent)
  previewUrl
  dynamicPreviewUrl
  thumbnailUrl
  focalPoint
}

fragment onAudio on Audio {
  author
  filename
  extension
  size
  downloadUrl(permanent: $permanent)
  previewUrl
  dynamicPreviewUrl
  thumbnailUrl
}

fragment onVideo on Video {
  author
  filename
  extension
  size
  downloadUrl(permanent: $permanent)
  previewUrl
  dynamicPreviewUrl
  thumbnailUrl
  width
  height
  duration
  bitrate
}
`;

export async function requestAssetsById(
    { domain, bearerToken, permanentDownloadUrls }: Options,
    ids: Asset[],
): Promise<FrontifyAsset[]> {
    const response = (await httpCall(`https://${domain}/graphql`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${bearerToken}`,
            'x-frontify-finder-version': `v${version}`,
            'x-frontify-beta': 'enabled',
            'x-frontify-development-flags': 'PUBLIC_API_DYNAMIC_CDN',
        },
        body: JSON.stringify({
            query: ASSET_BY_IDS_QUERY,
            variables: {
                ids,
                permanent: permanentDownloadUrls,
            },
        }),
    })) as AssetsResponse;

    if (response.errors) {
        logMessage('error', {
            code: 'ERR_FINDER_ASSETS_REQUEST',
            message: 'Assets data request failed.',
            error: response.errors[0],
        });
    }

    if (!response?.data?.assets || response.data.assets.length === 0) {
        throw new FinderError('ERR_FINDER_ASSETS_REQUEST_EMPTY', 'Assets data request returned no valid values.');
    }

    return response.data.assets.map((asset: FrontifyAsset) => {
        if (asset.previewUrl) {
            asset.previewUrl = asset.previewUrl.split('?')[0];
        }

        return asset;
    });
}

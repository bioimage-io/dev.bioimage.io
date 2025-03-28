import asyncio
import logging
import os
import sys
import json
from pathlib import Path

import httpx
import yaml
from dotenv import load_dotenv
from hypha_rpc import connect_to_server

load_dotenv()

logging.basicConfig(stream=sys.stdout)
logger = logging.getLogger("collection-migration")
logger.setLevel(logging.INFO)

# Define log file path
LOG_FILE_PATH = Path("migration.log")

# Formatter for log messages
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)

# File handler
file_handler = logging.FileHandler(LOG_FILE_PATH)
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(formatter)

# Add handlers to the logger
logger.addHandler(console_handler)
logger.addHandler(file_handler)


SERVER_URL = "https://hypha.aicell.io"
COLLECTION_JSON_URL = "https://uk1s3.embassy.ebi.ac.uk/public-datasets/bioimage.io/collection.json"
DEFAULT_TIMEOUT = 20
CONCURENT_TASKS = 10

# Animal id parts conversion: https://gist.github.com/oeway/66af633e7cb7e024e6a4bc1ecd2ad82a

async def fetch_collection_json():
    async with httpx.AsyncClient(headers={"Connection": "close"}) as client:
        response = await client.get(COLLECTION_JSON_URL)
        assert response.status_code == 200, f"Failed to fetch collection.json from {COLLECTION_JSON_URL}"
        return json.loads(response.text)

async def download_manifest(rdf_source):
    async with httpx.AsyncClient(headers={"Connection": "close"}) as client:
        response = await client.get(rdf_source)
        assert response.status_code == 200, f"Failed to fetch manifest from {rdf_source}"
        return yaml.safe_load(response.text.replace("!<tag:yaml.org,2002:js/undefined>", ""))
    

async def download_file(url, dest_path, max_retries=5, retry_delay=5):
    """Download a file with retry logic for handling rate limits (HTTP 429)."""
    retries = 0
    while retries < max_retries:
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, headers={"Connection": "close"}) as client:
                response = await client.get(f"{url}")
                if response.status_code == 200:
                    with open(dest_path, 'wb') as f:
                        f.write(response.content)
                    return True
                elif response.status_code == 429:  # Too Many Requests
                    logger.warning(f"Rate limit hit for {url}, retrying after {retry_delay} seconds...")
                    await asyncio.sleep(retry_delay)
                else:
                    logger.warning(f"Failed to download {url}, status code: {response.status_code}")
                    return False
        except Exception as e:
            logger.error(f"Error downloading {url}: {e}")
        retries += 1
        if retries < max_retries:
            await asyncio.sleep(retry_delay * retries)  # Exponential backoff
    logger.error(f"Failed to download {url} after {max_retries} retries.")
    return False

async def upload_file(artifact_manager, artifact_id, base_url, file_path, max_retries=5, retry_delay=5, download_weight=0):
    """Modified upload_file function to include retry logic."""
    file_path = file_path.lstrip("./")
    print(f"=========> Uploading {file_path} to {artifact_id}")

    if not file_path.startswith("http"):
        file_url = f"{base_url}/{file_path}"
    else:
        file_url = file_path
        file_path = file_path.split('?')[0].split("/")[-1]
        try:
            await artifact_manager.get_file(
                artifact_id,
                file_url
            )
            # remove the file with https name
            await artifact_manager.remove_file(
                artifact_id,
                file_url
            )
            logger.info(f"File with url file name has been removed {file_url}")
        except Exception:
            pass

    try:
        file_url = await artifact_manager.get_file(
            artifact_id,
            file_path
        )
        logger.info(f"File {file_path} already exists in {artifact_id}")
        return
    except Exception:
        logger.info(f"Uploading {file_path} from {file_url}")
    put_url = await artifact_manager.put_file(
        artifact_id=artifact_id,
        file_path=file_path,
        download_weight=download_weight,
    )
    retries = 0
    while retries < max_retries:
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, headers={"Connection": "close"}) as client:
                async with client.stream("GET", file_url) as response:
                    if response.status_code == 200:
                        headers = {"Connection": "close"}
                        if "Content-Length" in response.headers:
                            headers["Content-Length"] = response.headers["Content-Length"]
                        upload_response = await client.put(put_url, data=response.aiter_bytes(), headers=headers)
                        if upload_response.status_code == 200:
                            logger.info(f"Uploaded {artifact_id}: {file_path}")
                            return
                        elif response.status_code == 429:  # Too Many Requests
                            logger.warning(f"Rate limit hit for {file_url}, retrying after {retry_delay} seconds...")
                            await asyncio.sleep(retry_delay)
                        else:
                            logger.warning(f"Failed to upload {artifact_id}: {file_path}, status code: {upload_response.status_code}, {upload_response.text}")
                            return
                    else:
                        logger.exception(f"Failed to download {file_url}, status code: {response.status_code}")
                        return
        except httpx.ReadTimeout:
            logger.warning(f"Failed to upload {artifact_id}: {file_path}, read timeout")
        except Exception as e:
            logger.error(f"Error uploading {file_path}: {e}")
        retries += 1
        if retries < max_retries:
            await asyncio.sleep(retry_delay * retries)  # Exponential backoff
    logger.error(f"Failed to upload {artifact_id}: {file_path} after {max_retries} retries.")


async def upload_files(artifact_manager, artifact_id, base_url, documentation, covers, attachments, weights, inputs, outputs, test_inputs, test_outputs, sample_inputs, sample_outputs):

    # Upload README
    if documentation:
        await upload_file(artifact_manager, artifact_id, base_url, documentation)

    # Upload cover images
    for cover in covers:
        await upload_file(artifact_manager, artifact_id, base_url, cover)
        if ".thumbnail." in cover:
            await upload_file(artifact_manager, artifact_id, base_url, cover.replace(".thumbnail.", "."))

    # Upload samples
    for file in attachments.get('files', []):
        if isinstance(file, str):
            await upload_file(artifact_manager, artifact_id, base_url, file)
        else:
            await upload_file(artifact_manager, artifact_id, base_url, file['source'])
        
    # Upload weights
    if weights:
        for file in weights.values():
            if not file:
                continue
            if "architecture" in file:
                if isinstance(file["architecture"], str):
                    # architecture is a string, e.g. pytorch
                    await upload_file(artifact_manager, artifact_id, base_url, file["architecture"].split(":")[0])
                else:
                    if file["architecture"]["source"]:
                        await upload_file(artifact_manager, artifact_id, base_url, file["architecture"]["source"].split(":")[0])
            await upload_file(artifact_manager, artifact_id, base_url, file['source'], download_weight=1)
            if file.get("dependencies"):
                if isinstance(file["dependencies"], str):
                    # dependencies is a string, e.g. conda:enviroment.yml
                    source = file["dependencies"].split(":")[1]
                    await upload_file(artifact_manager, artifact_id, base_url, source)
                else:
                    await upload_file(artifact_manager, artifact_id, base_url, file["dependencies"]["source"])

    if inputs:
        for file in inputs:
            if "test_tensor" in file and file["test_tensor"]:
                await upload_file(artifact_manager, artifact_id, base_url, file["test_tensor"]["source"])
            if "sample_tensor" in file and file["sample_tensor"]:
                await upload_file(artifact_manager, artifact_id, base_url, file["sample_tensor"]["source"])
    
    if outputs:
        for file in outputs:
            if "test_tensor" in file and file["test_tensor"]:
                await upload_file(artifact_manager, artifact_id, base_url, file["test_tensor"]["source"])
            if "sample_tensor" in file and file["sample_tensor"]:
                await upload_file(artifact_manager, artifact_id, base_url, file["sample_tensor"]["source"])
    
    if sample_inputs:
        for file in sample_inputs:
            await upload_file(artifact_manager, artifact_id, base_url, file)
    
    if sample_outputs:
        for file in sample_outputs:
            await upload_file(artifact_manager, artifact_id, base_url, file)

    if test_inputs:
        for file in test_inputs:
            await upload_file(artifact_manager, artifact_id, base_url, file)
    
    if test_outputs:
        for file in test_outputs:
            await upload_file(artifact_manager, artifact_id, base_url, file)
    logger.info(f"Uploaded all files for {artifact_id}")

async def migrate_collection(skip_migrated):
    server = await connect_to_server({"server_url": SERVER_URL, "workspace": "bioimage-io", "token": os.environ.get("WORKSPACE_TOKEN")})
    artifact_manager = await server.get_service("public/artifact-manager")

    # Fetch collection YAML
    collection_json = await fetch_collection_json()
    if not collection_json:
        logger.info("Failed to fetch collection.yaml.")
        return

    # Read id_parts from JSON file
    script_dir = Path(__file__).parent
    id_parts_path = script_dir / "id_parts.json"
    try:
        with open(id_parts_path) as f:
            id_parts = json.load(f)
        logger.info(f"Loaded id_parts configuration from {id_parts_path}")
    except Exception as e:
        logger.error(f"Failed to load id_parts.json: {e}")
        id_parts = {}

    assert os.environ.get("S3_ENDPOINT_URL"), "S3_ENDPOINT_URL is not set"
    assert os.environ.get("S3_ACCESS_KEY_ID"), "S3_ACCESS_KEY_ID is not set"
    assert os.environ.get("S3_SECRET_ACCESS_KEY"), "S3_SECRET_ACCESS_KEY is not set"
    assert os.environ.get("SANDBOX_ZENODO_ACCESS_TOKEN"), "SANDBOX_ZENODO_ACCESS_TOKEN is not set"
    assert os.environ.get("ZENODO_ACCESS_TOKEN"), "ZENODO_ACCESS_TOKEN is not set"
    
    collection = await artifact_manager.create(
        alias="bioimage.io",
        type="collection",
        manifest={k: collection_json[k] for k in collection_json if k not in ["collection"]},
        config={
            "permissions": {"*": "r", "@": "r+"}, 
            "publish_to": "sandbox_zenodo",
            "id_parts": id_parts  # Add the id_parts configuration here
        },
        secrets={
            "SANDBOX_ZENODO_ACCESS_TOKEN": os.environ.get("SANDBOX_ZENODO_ACCESS_TOKEN"),
            "ZENODO_ACCESS_TOKEN": os.environ.get("ZENODO_ACCESS_TOKEN"),
            "S3_ENDPOINT_URL": os.environ.get("S3_ENDPOINT_URL"),
            "S3_ACCESS_KEY_ID": os.environ.get("S3_ACCESS_KEY_ID"),
            "S3_SECRET_ACCESS_KEY": os.environ.get("S3_SECRET_ACCESS_KEY"),
            "S3_REGION_NAME": os.environ.get("S3_REGION_NAME"),
            "S3_PREFIX": os.environ.get("S3_PREFIX"),
            "S3_BUCKET": os.environ.get("S3_BUCKET"),
        },
        overwrite=True
    )
    
    collection = await artifact_manager.read("bioimage.io")
    collection_manifest = collection["manifest"]
    print(f"Collection created: {collection_manifest}")

    # Create a semaphore to limit concurrent tasks
    semaphore = asyncio.Semaphore(CONCURENT_TASKS)  # Limit to CONCURENT_TASKS concurrent tasks

    async def migrate_dataset(item, skip_migrated):
        async with semaphore:
            dataset_id = item.get("nickname", item.get("id")).replace("/", ":")
            base_url = item["rdf_source"].replace("/rdf.yaml", "")

            try:
                # Download full manifest
                full_manifest = await download_manifest(item["rdf_source"])
            except Exception:
                logger.error(f"Failed to fetch manifest for {dataset_id}")
                return
            if not full_manifest:
                logger.info(f"Failed to fetch manifest for {dataset_id}")
                return
            full_manifest.update(item)
            
            try:
                artifact = await artifact_manager.read(dataset_id)
            except Exception:
                pass
            else:
                artifact = await artifact_manager.edit(
                    type=full_manifest.get("type"),
                    artifact_id=artifact.id,
                    manifest=full_manifest,
                )
                if skip_migrated:
                    logger.info(f"{full_manifest['type']} {dataset_id} already migrated.")
                    return
            # Create child artifact (dataset)
            artifact = await artifact_manager.create(
                type=full_manifest.get("type"),
                alias=dataset_id,
                parent_id="bioimage-io/bioimage.io",
                manifest=full_manifest,
                version="stage",
                overwrite=True
            )

            attachments = full_manifest.get('attachments', {})
            if isinstance(attachments, list):
                attachments = {"files": attachments}
            # Upload files (covers, attachments)
            # Upload the rdf.yaml file
            await upload_file(artifact_manager, artifact.id, base_url, item["rdf_source"])
            try:
                await upload_files(
                    artifact_manager=artifact_manager,
                    artifact_id=artifact.id,
                    base_url=base_url,
                    documentation=full_manifest.get('documentation', ''),
                    covers=full_manifest.get('covers', []),
                    attachments=attachments,
                    weights=full_manifest.get("weights", {}),
                    inputs=full_manifest.get("inputs", {}),
                    outputs=full_manifest.get("outputs", {}),
                    test_inputs=full_manifest.get("test_inputs", {}),
                    test_outputs=full_manifest.get("test_outputs", {}),
                    sample_inputs=full_manifest.get("sample_inputs", {}),
                    sample_outputs=full_manifest.get("sample_outputs", {}),
                )
            except Exception as e:
                logger.error(f"Failed to upload files for {dataset_id}: {e}")
                return

            try:
                # Commit the artifact
                artifact = await artifact_manager.commit(artifact_id=artifact.id)
                logger.info(f"{artifact.type} {dataset_id} migrated, file count: {artifact.file_count}")
            except Exception as e:
                logger.error(f"Failed to migrate, failed to commit {artifact.type} {dataset_id}: {e}")

    # Create a list of tasks
    tasks = [migrate_dataset(item, skip_migrated) for item in collection_json["collection"]]
    
    # Run tasks and wait for them to complete
    await asyncio.gather(*tasks)

    logger.info("Migration completed.")

# await migrate_collection(skip_migrated=False)
asyncio.run(migrate_collection(skip_migrated=False))

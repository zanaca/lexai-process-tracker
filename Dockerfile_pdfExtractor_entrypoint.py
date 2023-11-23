#!/usr/bin/env python3

import os
import json
import io
import warnings
import base64
import logging
import requests
from pdfminer.pdfinterp import PDFResourceManager, PDFPageInterpreter
from pdfminer.pdfpage import PDFPage
from pdfminer.converter import TextConverter
from pdfminer.layout import LAParams
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from tornado.platform.asyncio import AsyncIOMainLoop
import nsq, asyncio

NAME = "PDF Extractor"
PORT = int(os.environ.get("PORT", 8037))
FORMAT = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"

NSQ_TOPIC_CONVERT_PDF_AS_TEXT = os.environ.get("NSQ_TOPIC_PROCESSED_PDF")
NSQ_TOPIC_CONVERT_PDF = os.environ.get("NSQ_TOPIC_CONVERT_PDF")
NSQ_SERVER_READER = os.environ.get("SERVICE_NSQ_READER", "127.0.0.1:4161")
NSQ_SERVER_WRITER_HTTP = os.environ.get("SERVICE_NSQ_WRITER_HTTP", "127.0.0.1:4151")

warnings.filterwarnings("ignore")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(), format=FORMAT)

logger = logging.getLogger(NAME)


def pdfExtract(pdf_body, password=b"", rotation=0):
    rsrcmgr = PDFResourceManager(caching=True)
    out = io.StringIO()
    device = TextConverter(rsrcmgr, out, laparams=LAParams(), imagewriter=None)

    interpreter = PDFPageInterpreter(rsrcmgr, device)
    try:
        for page in PDFPage.get_pages(
            pdf_body,
            pagenos=set(),
            maxpages=0,
            password=password,
            caching=True,
            check_extractable=True,
        ):
            page.rotate = (page.rotate + rotation) % 360
            interpreter.process_page(page)
    except Exception as e:
        device.close()
        out.close()
        return None, str(e)

    output = out.getvalue()
    device.close()
    out.close()

    return output, None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, pattern, *args):
        logger.info("%s - %s", self.address_string(), pattern % args)

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Only POST")

    def do_POST(self):
        raw_data = ""
        if self.headers and "content-length" in self.headers:
            raw_data = self.rfile.read(int(self.headers["content-length"]))

        if raw_data == "":
            logger.error("No data received")
            self.send_response(400)
            self.end_headers()
            return

        try:
            payload = json.loads(raw_data.strip())
        except json.decoder.JSONDecodeError:
            logger.error(
                "Invalid JSON. Data received: '%s'", raw_data.strip().decode("utf-8")
            )
            self.send_response(400)
            self.end_headers()
            return

        msg_id = payload.get("id")

        pdf_metadata = payload.get("metadata", {})
        pdf_body = io.BytesIO(base64.b64decode(payload.get("base64pdf")))
        text_obj, error = pdfExtract(
            pdf_body,
            password=payload.get("password", b""),
            rotation=payload.get("rotation", 0),
        )

        if error:
            logger.error("Could not extract content: %s", error)
            self.send_response(400)
            self.end_headers()
            self.wfile.write(error.encode("utf-8"))
            return

        result = {
            "text": text_obj,
            "metadata": pdf_metadata,
            "source_id": payload.get("source_id"),
            "version": payload.get("version"),
            "original_message_id": msg_id,
        }
        if payload.get("request_id"):
            result["request_id"] = payload["request_id"]

        self.send_response(200)
        self.end_headers()
        self.wfile.write(bytes(json.dumps(result), "utf-8"))


def nsq_pub(data, topic=NSQ_TOPIC_CONVERT_PDF_AS_TEXT):
    url = f"http://{NSQ_SERVER_WRITER_HTTP}/pub?topic={topic}"
    resp = requests.post(url, data=json.dumps(data), timeout=5)

    if resp.status_code != 200:
        return resp, resp.text
    else:
        return resp, None


def nsq_msg_handler(message: nsq.Message):
    message.enable_async()
    msg_id = message.id.decode("utf-8")
    try:
        payload = json.loads(message.body)
    except json.decoder.JSONDecodeError:
        logger.error("Invalid JSON. Data received: '%s'", message.body)
        out = {
            "error": "Invalid JSON",
            "original_message_id": msg_id,
        }
        _, error = nsq_pub(out)
        if error:
            logger.error("Could not publish error: %s", error)

        message.finish()
        return

    metadata = payload.get("metadata", payload.get("pdfMetadata", {}))
    pdf_body = io.BytesIO(base64.b64decode(payload.get("base64pdf")))
    text_obj, error = pdfExtract(
        pdf_body,
        password=payload.get("password", b""),
        rotation=payload.get("rotation", 0),
    )

    if error:
        logger.error("Could not extract content: %s", error)
        out = {
            "error": f"Could not extract content: {error}",
            "original_message_id": msg_id,
            "metadata": metadata,
            "source_id": payload.get("source_id"),
            "version": payload.get("version"),
        }

        _, error = nsq_pub(out)
        if error:
            logger.error("Could not publish error: %s", error)

        message.finish()

        print(metadata)

        return

    output = {
        "text": text_obj.strip(),
        "original_message_id": msg_id,
        "metadata": metadata,
        "source_id": payload.get("source_id"),
        "version": payload.get("version"),
    }
    _, error = nsq_pub(output)
    if error:
        logger.error("Could not publish error: %s", error)
        message.requeue()
    else:
        message.finish()
    return


async def reader_from_nsq():
    nsq.Reader(
        topic=NSQ_TOPIC_CONVERT_PDF,
        channel=f"{NAME.lower().replace(' ','-')}",
        message_handler=nsq_msg_handler,
        lookupd_connect_timeout=10,
        requeue_delay=10,
        nsqd_tcp_addresses=[NSQ_SERVER_READER],
        max_in_flight=int(os.environ.get("NSQ_MAX_IN_FLIGHT", 5)),
        snappy=False,
        deflate=True,
    )


class ThreadingSimpleServer(ThreadingMixIn, HTTPServer):
    pass


def run_http():
    logger.info("Starting htttp server on port %s", PORT)
    server = ThreadingSimpleServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


def run_nsq():
    logger.info("Starting NSQ reader")
    loop = asyncio.get_event_loop()
    AsyncIOMainLoop().install()
    loop.create_task(reader_from_nsq())
    loop.run_forever()


if __name__ == "__main__":
    if NSQ_TOPIC_CONVERT_PDF:
        run_nsq()
    else:
        run_http()

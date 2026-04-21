class CheckshotVSPProcessor:
    def __init__(self):
        pass

    def process_checkshot(self, data):
        # TODO: implement checkshot processing
        return {"status": "ok", "type": "checkshot", "input": data}

    def process_vsp(self, data):
        # TODO: implement VSP processing
        return {"status": "ok", "type": "vsp", "input": data}


processor = CheckshotVSPProcessor()

if __name__ == "__main__":
    sample_data = {"example": True}
    print(processor.process_checkshot(sample_data))
    print(processor.process_vsp(sample_data))

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const [input] = inputs;
    if (input && input[0]) {
      const channelData = input[0];
      this.port.postMessage(channelData.slice());
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);

package com.nowen.note;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MediaStoreSavePlugin.class);
    super.onCreate(savedInstanceState);
  }
}